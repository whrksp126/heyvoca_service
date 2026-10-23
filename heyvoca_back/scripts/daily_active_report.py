"""일별 실사용자(전환) 리포트 — 읽기 전용 CLI (2026-10, 이슈 #13).

집계 로직은 app/services/daily_report.py 단일 소스. 지표 정의는 docs/DAILY_ACTIVE_REPORT.md.
DB 에 아무것도 쓰지 않는다. 출력에 이메일·이름을 넣지 않는다(집계 수치만).

인자
  --date YYYY-MM-DD     끝 날짜(KST, 기본 어제)
  --days N              끝 날짜에서 거꾸로 N일(기본 1)
  --start YYYY-MM-DD    시작 날짜(주면 --days 무시)
  --format md|json|both 기본 md (both = Markdown 뒤에 JSON)
  --exclude-email a@b   제외 이메일 추가(반복 가능). env REPORT_EXCLUDE_EMAILS 도 읽는다.

실행 (compose 가 ./scripts 를 ro 마운트해 컨테이너 안 heyvoca_back/scripts 가 가려지므로 stdin 방식)
  # 배포 후
  docker exec -i -w /app heyvoca_back_<env> python3 - --days 14 < heyvoca_back/scripts/daily_active_report.py
  # 서비스 모듈이 아직 배포되지 않은 서버 — 둘을 이어 붙여 넣는다(아래 import 가드가 처리)
  cat heyvoca_back/app/services/daily_report.py heyvoca_back/scripts/daily_active_report.py \
    | docker exec -i -w /app heyvoca_back_<env> python3 - --days 14
"""

import contextlib
import datetime as dt
import json
import sys

# create_app 이 스케줄러·설정 안내를 stdout 에 찍는다 — 리포트 출력과 섞이지 않게 stderr 로 돌린다.
with contextlib.redirect_stdout(sys.stderr):
    from run import app

if 'build_report' not in globals():   # 서비스 모듈을 이어 붙여 실행한 경우 이미 정의돼 있다
    from app.services.daily_report import build_report, render_markdown, kst_today


def _args(argv):
    opts = {'date': None, 'days': 1, 'start': None, 'format': 'md', 'exclude': []}
    i = 0
    while i < len(argv):
        a = argv[i]
        val = argv[i + 1] if i + 1 < len(argv) else None
        if a == '--date':
            opts['date'] = dt.date.fromisoformat(val)
        elif a == '--days':
            opts['days'] = max(1, int(val))
        elif a == '--start':
            opts['start'] = dt.date.fromisoformat(val)
        elif a == '--format':
            opts['format'] = val
        elif a == '--exclude-email':
            opts['exclude'].append(val)
        else:
            sys.exit(f'알 수 없는 인자: {a}')
        i += 2
    return opts


def main():
    o = _args(sys.argv[1:])
    end = o['date'] or (kst_today() - dt.timedelta(days=1))
    start = o['start'] or (end - dt.timedelta(days=o['days'] - 1))
    rep = build_report(start, end, extra_exclude_emails=o['exclude'])
    if o['format'] in ('md', 'both'):
        print(render_markdown(rep))
    if o['format'] in ('json', 'both'):
        print(json.dumps(rep, ensure_ascii=False, indent=2))


with app.app_context():
    main()
