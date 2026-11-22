"""자정 실적 수동 실행 — 매일 00:00 KST 스케줄러('daily_report')와 같은 내용.

컨테이너 안에서:
  python3 -m jobs.daily_report --dry-run                 # 어제 실적을 출력만
  python3 -m jobs.daily_report --dry-run --date 2026-11-21
  python3 -m jobs.daily_report --send                    # CodingPT 채널로 전송(CODINGPT_WEBHOOK_URL 필요)

집계 로직은 app/services/ops_daily_report.py 단일 소스. DB 에 쓰지 않는다.
"""
import argparse
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    p = argparse.ArgumentParser(description='헤이보카 자정 실적(CodingPT 알림)')
    g = p.add_mutually_exclusive_group()
    g.add_argument('--dry-run', action='store_true', help='전송하지 않고 출력(기본)')
    g.add_argument('--send', action='store_true', help='CodingPT 알림 채널로 전송')
    p.add_argument('--date', help='집계할 날(KST, YYYY-MM-DD). 기본 어제')
    p.add_argument('--no-compare', action='store_true', help='전날 대비 생략')
    args = p.parse_args()

    day = dt.date.fromisoformat(args.date) if args.date else None

    from app import create_app
    from app.services import codingpt_notify as cn
    from app.services import ops_daily_report as rep

    if args.send and not cn.webhook_url():
        print('CODINGPT_WEBHOOK_URL 이 없어 보낼 수 없습니다.', file=sys.stderr)
        sys.exit(2)

    app = create_app()
    with app.app_context():
        title, text, fields = rep.run(day=day, send=args.send, compare=not args.no_compare)
    print(title)
    print(text)
    print(json.dumps(fields, ensure_ascii=False))
    if args.send:
        print('→ 전송 요청 완료')


if __name__ == '__main__':
    main()
