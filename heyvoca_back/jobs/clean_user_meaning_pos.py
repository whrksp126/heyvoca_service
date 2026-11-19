"""
사용자 단어 뜻 복사본에 섞인 품사 약어 정리 (2026-11-19 회의 QA, 일회성·idempotent).

서점 단어장에서 복사된 뜻 "환불; v. 환불하다" 같은 문자열을
["환불", "환불하다"] 로 나누고, 약어로 명시된 품사는 user_voca.meaning_pos({뜻: UD 태그})에 남긴다.
대상: user_voca.voca_meanings, user_voca_book_map.voca_meanings (뜻 원소 중 하나라도 품사 표기가 있는 행만).
판정 규칙은 app/services/meaning_pos.py(split_meaning_pos) 하나 — 저장 경로와 같다.

meaning_pos 컬럼(마이그레이션 c4e8a2f1d9b7)이 아직 없는 DB 에서도 텍스트 정리는 된다(품사 기록만 건너뜀).
사전 연결 뜻의 품사는 응답 때 사전에서 찾으므로 텍스트만 고쳐도 라벨은 나온다.

실행(컨테이너 안):
    python3 jobs/clean_user_meaning_pos.py            # dry-run (기본) — 바뀔 행만 출력
    python3 jobs/clean_user_meaning_pos.py --apply    # 실제 반영
쓰기 전에 대상 테이블 백업을 db/backups/ 에 새 파일로 남길 것.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _has_marker(meanings, split_meaning_pos):
    for m in meanings:
        if isinstance(m, str) and len(split_meaning_pos(m)) > 1 or (
                isinstance(m, str) and any(p for _, p in split_meaning_pos(m))):
            return True
    return False


def run(apply=False):
    try:
        from app.services.meaning_pos import split_meaning_pos, clean_meaning_list, merge_pos_json
    except ImportError:  # 배포 전 컨테이너: meaning_pos.py 를 앞에 이어 붙여 실행한 경우
        g = globals()
        split_meaning_pos, clean_meaning_list, merge_pos_json = (
            g['split_meaning_pos'], g['clean_meaning_list'], g['merge_pos_json'])
    from sqlalchemy import inspect, text
    from app import create_app, db

    app = create_app()
    with app.app_context():
        eng = db.get_engine(app)  # 사용자 DB(기본 bind)
        has_pos_col = any(c['name'] == 'meaning_pos' for c in inspect(eng).get_columns('user_voca'))
        like = "(voca_meanings LIKE '%.%' OR voca_meanings LIKE '%[%' OR voca_meanings LIKE '%(%')"
        stats = {'user_voca': 0, 'user_voca_book_map': 0, 'pos_recorded': 0, 'has_pos_col': has_pos_col}

        with eng.begin() as conn:
            cols = 'id, voca_meanings' + (', meaning_pos' if has_pos_col else '')
            for row in conn.execute(text(f'SELECT {cols} FROM user_voca WHERE {like}')).fetchall():
                try:
                    meanings = json.loads(row.voca_meanings)
                except (TypeError, ValueError):
                    continue
                if not isinstance(meanings, list) or not _has_marker(meanings, split_meaning_pos):
                    continue
                texts, pos_map = clean_meaning_list(meanings)
                print(f'user_voca {row.id}: {meanings} -> {texts} {pos_map}')
                stats['user_voca'] += 1
                if not apply:
                    continue
                params = {'id': row.id, 'm': json.dumps(texts, ensure_ascii=False)}
                if has_pos_col:
                    params['p'] = merge_pos_json(row.meaning_pos, pos_map)
                    conn.execute(text('UPDATE user_voca SET voca_meanings=:m, meaning_pos=:p WHERE id=:id'), params)
                    stats['pos_recorded'] += 1 if pos_map else 0
                else:
                    conn.execute(text('UPDATE user_voca SET voca_meanings=:m WHERE id=:id'), params)

            for row in conn.execute(text(f'SELECT id, voca_meanings FROM user_voca_book_map WHERE {like}')).fetchall():
                try:
                    meanings = json.loads(row.voca_meanings)
                except (TypeError, ValueError):
                    continue
                if not isinstance(meanings, list) or not _has_marker(meanings, split_meaning_pos):
                    continue
                texts, _ = clean_meaning_list(meanings)
                print(f'user_voca_book_map {row.id}: {meanings} -> {texts}')
                stats['user_voca_book_map'] += 1
                if apply:
                    conn.execute(text('UPDATE user_voca_book_map SET voca_meanings=:m WHERE id=:id'),
                                 {'id': row.id, 'm': json.dumps(texts, ensure_ascii=False)})
        print(stats, 'APPLIED' if apply else 'DRY-RUN')
        return stats


if __name__ == '__main__':
    run(apply='--apply' in sys.argv or os.environ.get('APPLY') == '1')
