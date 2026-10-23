"""
학습 중 오류 신고(content_report)를 AI 일괄 처리용으로 내보내는 스크립트.

신고를 대상(사전 단어 / 글자 / 사용자 직접 단어)별로 묶고, 각 묶음에
  - 신고들(사유·메모·신고 순간 화면 스냅샷)
  - 지금 사전 원본(heyvoca_dict / heyvoca_dict_ja 의 단어·뜻(품사)·예문, ja 는 읽기·JLPT)
  - 신고한 사용자의 단어장 사본(UserVoca 의 뜻·예문 — 사전과 다를 수 있다)
를 함께 실어 JSON 또는 Markdown 으로 출력한다. 이 파일을 통째로 AI 에게 넘기고
"신고마다 수정안(또는 기각 사유)을 내라"고 시키면 된다. DB 는 읽기만 한다.

사용법 (heyvoca_service/ 에서):
  컨테이너의 /app/scripts 는 heyvoca_service/scripts 가 마운트돼 이 폴더를 가리므로 복사해서 실행한다.
  docker cp heyvoca_back/scripts/export_content_reports.py heyvoca_back_local:/tmp/
  docker exec -e PYTHONPATH=/app heyvoca_back_local python3 /tmp/export_content_reports.py [옵션] 2>/dev/null > reports.md
  (dev/prod 는 같은 명령을 서버에서 heyvoca_back_dev / heyvoca_back_prod 로 — 읽기 전용이다)

옵션:
  --format json|md     출력 형식 (기본 md)
  --status S           open|resolved|rejected|all (기본 open)
  --reason R           사유 코드 하나만 (meaning|example|audio|grading|question|other)
  --lang L             en|ja|script|custom 하나만
  --since YYYY-MM-DD   이 날짜(KST) 이후 신고만
  --limit N            묶음 최대 개수 (기본 500, 신고 많은 대상부터)

처리 후 상태 변경은 어드민 '오류 신고' 화면 또는 PATCH /admin/reports/bulk {ids, status, resolve_note}.
사전 수정은 .claude/rules/db-migration.md '사전 데이터만 갱신' 절차(admin 사전 동기화)로만 발행한다.
"""

import argparse
import contextlib
import datetime as dt
import json
import os
import sys
from collections import OrderedDict

sys.path.insert(0, os.environ.get('PYTHONPATH') or os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import ContentReport, UserVoca, Voca
from app.routes.content_report import REASONS
from app.utils.dict_lang import use_dict_lang
from app.utils.word_payload import load_ja_word_extras, load_ja_example_tokens

AI_INSTRUCTIONS = (
    "아래는 영어/일본어 단어 학습 앱 사용자가 학습 중 보낸 데이터 오류 신고다. "
    "대상(단어)별로 사전 원본과 신고 순간 화면(snapshot)이 함께 있다. 신고마다 "
    "① 실제 오류인지 판단하고 ② 오류면 사전에서 바꿀 필드와 새 값(meaning id·example id 지정), "
    "③ 아니면 기각 사유를 한 줄로 내라. 사전 id(voca.id)는 append-only — 새 단어를 만들지 말고 "
    "기존 행을 고치는 안만 낸다. 결과는 report_id 별로 {action: fix|reject, changes, note} 형태로."
)


def _json_load(text):
    if not text:
        return None
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return text


def load_dict_entries(lang, voca_ids):
    """사전 원본 — {voca_id: {...}}. 언어별로 세션을 비워 identity map 충돌을 막는다."""
    if not voca_ids:
        return {}
    db.session.expunge_all()
    out = {}
    with use_dict_lang(lang):
        extras = load_ja_word_extras(list(voca_ids), lang) if lang == 'ja' else {}
        for v in Voca.query.filter(Voca.id.in_(list(voca_ids))).all():
            examples = [{'id': em.example.id, 'exam_en': em.example.exam_en, 'exam_ko': em.example.exam_ko}
                        for em in v.voca_examples if em.example]
            if lang == 'ja':
                tokens = load_ja_example_tokens([e['id'] for e in examples], lang)
                for e in examples:
                    if e['id'] in tokens:
                        e['reading_tokens'] = tokens[e['id']]
            entry = {
                'voca_id': v.id, 'word': v.word, 'pronunciation': v.pronunciation,
                'verb_forms': v.verb_forms, 'level': v.level, 'is_active': v.is_active,
                'meanings': [{'id': mm.meaning.id, 'meaning': mm.meaning.meaning, 'pos': mm.meaning.pos}
                             for mm in v.voca_meanings if mm.meaning],
                'examples': examples,
            }
            if v.id in extras:
                entry['ja'] = extras[v.id]
            out[v.id] = entry
    db.session.expunge_all()
    return out


def build(args):
    q = ContentReport.query
    if args.status != 'all':
        q = q.filter(ContentReport.status == args.status)
    if args.reason:
        q = q.filter(ContentReport.reason == args.reason)
    if args.lang:
        q = q.filter(ContentReport.dict_lang == args.lang)
    if args.since:
        since = dt.datetime.strptime(args.since, '%Y-%m-%d') - dt.timedelta(hours=9)
        q = q.filter(ContentReport.created_at >= since)
    reports = q.order_by(ContentReport.created_at.asc()).all()

    groups = OrderedDict()
    for r in reports:
        if r.voca_id:
            key = f'{r.dict_lang}:{r.voca_id}'
        else:
            key = f'{r.dict_lang or "custom"}:{r.target_key or r.word}'
        groups.setdefault(key, []).append(r)

    ordered = sorted(groups.items(), key=lambda kv: -len(kv[1]))[:args.limit]

    by_lang = {}
    for _, rs in ordered:
        r0 = rs[0]
        if r0.voca_id and r0.dict_lang in ('en', 'ja'):
            by_lang.setdefault(r0.dict_lang, set()).add(r0.voca_id)
    dict_entries = {lang: load_dict_entries(lang, ids) for lang, ids in by_lang.items()}

    uv_ids = {r.user_voca_id for _, rs in ordered for r in rs if r.user_voca_id}
    user_copies = {}
    if uv_ids:
        for uv in UserVoca.query.filter(UserVoca.id.in_(list(uv_ids))).all():
            user_copies[uv.id] = {'word': uv.word, 'meanings': _json_load(uv.voca_meanings),
                                  'examples': _json_load(uv.voca_examples)}

    items = []
    for key, rs in ordered:
        r0 = rs[0]
        items.append({
            'target': key,
            'dict_lang': r0.dict_lang,
            'voca_id': r0.voca_id,
            'word': r0.word or r0.target_key,
            'report_count': len(rs),
            'dictionary': dict_entries.get(r0.dict_lang, {}).get(r0.voca_id),
            'reports': [{
                'report_id': r.id,
                'reason': r.reason,
                'reason_label': REASONS.get(r.reason, r.reason),
                'memo': r.memo,
                'question_type': r.question_type,
                'test_type': r.test_type,
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'status': r.status,
                'snapshot': r.snapshot,
                'user_copy': user_copies.get(r.user_voca_id),
            } for r in rs],
        })

    return {
        'generated_at': dt.datetime.utcnow().isoformat() + 'Z',
        'filters': {'status': args.status, 'reason': args.reason, 'lang': args.lang, 'since': args.since},
        'instructions': AI_INSTRUCTIONS,
        'reason_codes': REASONS,
        'target_count': len(items),
        'report_count': sum(i['report_count'] for i in items),
        'targets': items,
    }


def _j(obj):
    return json.dumps(obj, ensure_ascii=False)


def to_markdown(data):
    lines = [
        '# 헤이보카 오류 신고 내보내기',
        '',
        f"- 생성: {data['generated_at']} · 필터: {_j(data['filters'])}",
        f"- 대상 {data['target_count']}개 / 신고 {data['report_count']}건",
        '',
        '## 처리 지침',
        '',
        data['instructions'],
        '',
    ]
    for t in data['targets']:
        lines += [f"## {t['word']}  `{t['target']}` — 신고 {t['report_count']}건", '']
        d = t['dictionary']
        if d:
            lines.append(f"**사전 원본** (voca_id={d['voca_id']}, 발음 {d.get('pronunciation') or '-'})")
            if d.get('ja'):
                lines.append(f"- 일본어: {_j(d['ja'])}")
            for m in d['meanings']:
                lines.append(f"- 뜻 #{m['id']} [{m.get('pos') or '-'}] {m['meaning']}")
            for e in d['examples']:
                lines.append(f"- 예문 #{e['id']} {e.get('exam_en') or ''} / {e.get('exam_ko') or ''}")
        else:
            lines.append('**사전 원본 없음** (글자 학습·직접 추가 단어 등)')
        lines.append('')
        for r in t['reports']:
            lines.append(f"### 신고 #{r['report_id']} — {r['reason_label']} ({r['question_type'] or '-'}, {r['created_at']})")
            if r['memo']:
                lines.append(f"- 메모: {r['memo']}")
            if r['snapshot']:
                lines.append(f"- 화면: `{_j(r['snapshot'])}`")
            if r['user_copy']:
                lines.append(f"- 사용자 단어장 사본: `{_j(r['user_copy'])}`")
            lines.append('')
    return '\n'.join(lines)


def main():
    p = argparse.ArgumentParser(description='오류 신고 내보내기 (AI 일괄 처리용)')
    p.add_argument('--format', choices=['json', 'md'], default='md')
    p.add_argument('--status', choices=['open', 'resolved', 'rejected', 'all'], default='open')
    p.add_argument('--reason', choices=list(REASONS))
    p.add_argument('--lang', choices=['en', 'ja', 'script', 'custom'])
    p.add_argument('--since')
    p.add_argument('--limit', type=int, default=500)
    args = p.parse_args()

    # 앱 기동 로그(FCM 스케줄러 등)가 stdout 에 섞이면 JSON 이 깨진다 — 기동·조회 동안 stderr 로 돌린다
    with contextlib.redirect_stdout(sys.stderr):
        app = create_app()
        with app.app_context():
            data = build(args)
    if args.format == 'json':
        print(json.dumps(data, ensure_ascii=False, indent=2, default=str))
    else:
        print(to_markdown(data))


if __name__ == '__main__':
    main()
