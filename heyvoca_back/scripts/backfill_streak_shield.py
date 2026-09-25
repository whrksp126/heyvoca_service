"""연속 학습 보호권 소급 복구 (일회성, 2026-09-25 보호권 규칙 개편 후속).

배경
  예전 `_settle` 은 빈 날이 **2일 이상**이면 보호권을 갖고 있어도 쓰지 않고 연속을 끊었다.
  새 규칙(빈 날 1~7일 + 보유 충분 → 자동 소모, 계약서 §1)이었다면 이어졌을 사용자를
  새 규칙대로 되돌린다.

판정 (사용자 현지 '오늘' 기준. 오늘은 빈 날로 치지 않는다)
  1. CheckIn(streak_qualified | streak_protected)을 되짚어 **가장 최근의 빈 날 묶음**을 찾는다.
  2. 묶음이 끝난 날이 최근 30일 이내, 묶음 직전까지 이어진 연속(pre) >= 1 이어야 목록에 오른다.
  3. 제외: 빈 날 1일(예전 규칙도 소모) / 8일 이상 / 멈춤·옛 복구창 진행 중 /
           다시 잇기 도전 진행 중(active) / 저장 상태가 아직 끊기지 않음(= 새 규칙이 다음 접속에 처리).
     새 규칙으로 이미 보호된 날은 연속 인정일이라 애초에 빈 날 묶음에 들지 않는다 → 중복 소모 없음.
  4. 보유 보호권 < gap 이면 복구하지 않고 '보유 부족'으로만 표시.

적용 (대상자별 한 트랜잭션, UserStreak 행 잠금 → 보호권 행 잠금 순서 = `_apply_protection` 과 같음)
  - 보호권 gap 개 소모(inventory.spend, 아이템 이력 description 에 '소급 복구')
  - 빈 날마다 CheckIn.streak_protected=True (없으면 생성, studied=False)
  - current = pre + gap + 이후 이어진 날, last_qualified_day 갱신, best=max, protected_days_cnt += gap
  - 제안(offered) 상태의 다시 잇기는 정리(되찾았으므로 불필요)
  - FarmEvent STREAK_PROTECTED (reason='BACKFILL')
  - pending_notice = protected notice (새 id)
  잠금을 잡은 뒤 판정을 다시 해서, 그 사이 새 `_settle` 이 처리했다면 건너뛴다.

실행 (compose 가 ./scripts 를 ro 마운트해 컨테이너 안 스크립트가 가려지므로 stdin 방식)
  docker exec -i -w /app heyvoca_back_<env> python3 - [--apply] [--user <uuid>] \
      < heyvoca_back/scripts/backfill_streak_shield.py

  기본은 dry-run(아무것도 바꾸지 않음). --apply 일 때만 반영.
  출력에는 사용자 id 앞 8자만 쓴다(이메일·이름 출력 금지).
"""

import datetime as dt
import sys
from uuid import UUID

from run import app

from app import db
from app.models.models import CheckIn, FarmEvent, FarmItem, UserStreak
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import events, inventory, localday
from app.services.game.farm_v2 import streak_v2 as S

_DAY = dt.timedelta(days=1)
RECENT_DAYS = 30          # 묶음이 끝난 날이 이 안이어야 대상
MIN_GAP = 2               # 1일은 예전 규칙도 자동 소모했다
MAX_GAP = C.STREAK_MAX_PROTECT_GAP   # 7

ST_TARGET = '복구 대상'
ST_SHORT = '보유 부족'
ST_DONE = '복구 완료'


def _args():
    argv = sys.argv[1:]
    apply = '--apply' in argv
    only_user = None
    if '--user' in argv:
        only_user = UUID(argv[argv.index('--user') + 1])
    return apply, only_user


def _candidate_user_ids(only_user):
    if only_user is not None:
        return [only_user]
    # 시간대 차이를 넉넉히 덮도록 묶음 판정 범위 + 여유를 잡는다.
    since = dt.date.today() - dt.timedelta(days=RECENT_DAYS + MAX_GAP + 3)
    rows = (
        db.session.query(CheckIn.user_id)
        .filter(CheckIn.attendence_date >= since,
                (CheckIn.streak_qualified == True) | (CheckIn.streak_protected == True))  # noqa: E712
        .distinct()
        .all()
    )
    return [r[0] for r in rows]


def analyze(user_id, st, now):
    """읽기만 한다. 목록에 올릴 가치가 없으면 None."""
    tz = localday.get_timezone(user_id)
    today = localday.local_day(now, tz)
    flags = S.day_flags(user_id, today - dt.timedelta(days=S._WALK_BACK_DAYS), today)
    counted = S._counted_days(flags)
    horizon = today - dt.timedelta(days=RECENT_DAYS)

    # 어제부터 거슬러 인정된 날을 지나 처음 만나는 빈 날 = 가장 최근 묶음의 끝
    cursor = today - _DAY
    while cursor in counted and cursor >= horizon:
        cursor -= _DAY
    if cursor < horizon:
        return None
    end = cursor
    gap = 0
    floor = today - dt.timedelta(days=S._WALK_BACK_DAYS)
    while cursor not in counted and cursor >= floor:
        gap += 1
        cursor -= _DAY
    if cursor in counted:
        start = cursor + _DAY
    else:
        return None   # 창 끝까지 빈 날 — 그 앞 연속 없음
    anchor = start - _DAY

    pre = 0
    c = anchor
    while c in counted:
        pre += 1
        c -= _DAY
    if pre < 1:
        return None

    post = 0
    c = end + _DAY
    while c <= today and c in counted:
        post += 1
        c += _DAY
    missed = [start + dt.timedelta(days=i) for i in range(gap)]
    last_day = end + dt.timedelta(days=post)
    new_current = max(pre + gap + post, st.current_streak or 0)

    have = inventory.get_qty(user_id, FarmItem.SHIELD)
    info = {'today': today, 'gap': gap, 'pre': pre, 'post': post, 'missed': missed,
            'anchor': anchor, 'last_day': last_day, 'new_current': new_current,
            'have': have, 'status': None}

    if gap < MIN_GAP:
        info['status'] = '제외: 빈 날 1일(예전 규칙도 자동 소모)'
    elif gap > MAX_GAP:
        info['status'] = '제외: 빈 날 8일 이상'
    elif st.recovery_deadline is not None:
        info['status'] = '제외: 멈춤/복구창 진행 중(새 규칙 처리)'
    elif st.earn_back_status == S.EARN_BACK_ACTIVE:
        info['status'] = '제외: 다시 잇기 도전 진행 중'
    elif st.last_qualified_day == anchor:
        info['status'] = '제외: 아직 안 끊김(새 규칙이 다음 접속에 처리)'
    elif have < gap:
        info['status'] = ST_SHORT
    else:
        info['status'] = ST_TARGET
    return info


def apply_one(user_id, now):
    """한 사용자 한 트랜잭션. 잠금 후 다시 판정한다. 결과 info(또는 None)."""
    try:
        st = (db.session.query(UserStreak)
              .filter(UserStreak.user_id == user_id)
              .with_for_update()
              .first())
        if st is None:
            db.session.rollback()
            return None
        info = analyze(user_id, st, now)
        if info is None or info['status'] != ST_TARGET:
            db.session.rollback()
            return info

        today, gap, missed = info['today'], info['gap'], info['missed']
        days_iso = [d.isoformat() for d in missed]
        have_before = info['have']
        have_after = inventory.spend(
            user_id, FarmItem.SHIELD, gap,
            description='연속 학습 보호 소급 복구 ({})'.format(', '.join(days_iso)))
        for day in missed:
            checkin = S._get_or_create_checkin(user_id, day, studied=False)
            checkin.streak_protected = True

        st.current_streak = info['new_current']
        st.last_qualified_day = info['last_day']
        st.best_streak = max(st.best_streak or 0, st.current_streak)
        st.protected_days_cnt = (st.protected_days_cnt or 0) + gap
        if st.earn_back_status == S.EARN_BACK_OFFERED:
            S._clear_earn_back(st)

        events.log(user_id, FarmEvent.STREAK_PROTECTED, reason='BACKFILL',
                   detail={'days': days_iso, 'streak': st.current_streak,
                           'pre': info['pre'], 'post': info['post']})
        S._set_notice(st, 'protected', today, {
            'shields_spent': gap,
            'days': days_iso,
            'streak': st.current_streak,
            'shield_before': have_before,
            'shield_after': have_after,
        })
        db.session.commit()
        info['status'] = ST_DONE
        info['have_after'] = have_after
        return info
    except Exception:
        db.session.rollback()
        raise


def main():
    apply, only_user = _args()
    now = dt.datetime.utcnow()
    mode = 'APPLY' if apply else 'DRY-RUN'
    print('[backfill_streak_shield] mode={} now_utc={}'.format(mode, now.isoformat(timespec='seconds')))

    header = '{:<9} {:>4} {:>4} {:>5} {:>7} {:>9}  {}'.format(
        'user', 'gap', 'pre', 'post', '복구후', '보유/필요', '상태')
    print(header)
    print('-' * 70)

    counts = {}
    for uid in _candidate_user_ids(only_user):
        st = db.session.query(UserStreak).filter(UserStreak.user_id == uid).first()
        if st is None:
            continue
        info = analyze(uid, st, now)
        db.session.rollback()   # 읽기 트랜잭션을 닫아 둔다
        if info is None:
            continue
        if apply and info['status'] == ST_TARGET:
            try:
                res = apply_one(uid, now)
            except Exception as e:   # 한 명 실패가 나머지를 막지 않게
                print('{:<9} 실패: {}'.format(str(uid)[:8], type(e).__name__))
                counts['실패'] = counts.get('실패', 0) + 1
                continue
            if res is None:
                continue
            info = res
        status = info['status']
        counts[status] = counts.get(status, 0) + 1
        gap_s = str(info['gap'])
        restored = str(info['new_current']) if status in (ST_TARGET, ST_SHORT, ST_DONE) else '-'
        print('{:<9} {:>4} {:>4} {:>5} {:>7} {:>9}  {}'.format(
            str(uid)[:8], gap_s, info['pre'], info['post'], restored,
            '{}/{}'.format(info['have'], gap_s), status))

    print('-' * 70)
    for k, v in sorted(counts.items()):
        print('  {}: {}'.format(k, v))
    if not apply:
        print('(dry-run — 반영하려면 --apply)')


with app.app_context():
    main()
