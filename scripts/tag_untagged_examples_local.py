#!/usr/bin/env python3
"""강조 누락 예문을 로컬 규칙(spaCy/Kiwi/regex)으로만 보완한다. GPT 미사용."""
import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlparse

import pymysql

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from app.utils.example_tagging import tag_example_pair

def connect():
    p=urlparse(os.environ['DATABASE_URL_DICT'])
    return pymysql.connect(host=p.hostname,port=p.port or 3306,user=unquote(p.username or ''),password=unquote(p.password or ''),
        database=p.path.lstrip('/'),charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,autocommit=False)

def main():
    ap=argparse.ArgumentParser();mode=ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run',action='store_true');mode.add_argument('--apply',action='store_true');args=ap.parse_args();conn=connect()
    try:
        with conn.cursor() as cur:
            cur.execute('''SELECT e.id,e.exam_en,e.exam_ko,em.voca_id,v.word
                FROM voca_example e JOIN voca_example_map em ON em.example_id=e.id JOIN voca v ON v.id=em.voca_id
                WHERE (e.exam_en<>'' AND e.exam_en NOT LIKE '%target-word%')
                   OR (e.exam_ko<>'' AND e.exam_ko NOT LIKE '%target-word%') ORDER BY e.id''')
            rows=cur.fetchall();by_example=defaultdict(list)
            for r in rows:by_example[r['id']].append(r)
            voca_ids={r['voca_id'] for r in rows};meanings=defaultdict(list)
            if voca_ids:
                ids=list(voca_ids);ph=','.join(['%s']*len(ids))
                cur.execute(f'SELECT mm.voca_id,m.meaning FROM voca_meaning_map mm JOIN voca_meaning m ON m.id=mm.meaning_id WHERE mm.voca_id IN ({ph})',ids)
                for r in cur.fetchall():meanings[r['voca_id']].append(r['meaning'])
            updates=[];shared=0
            for eid,group in by_example.items():
                if len({r['voca_id'] for r in group})!=1:shared+=1;continue
                r=group[0];en,ko,_,_=tag_example_pair(r['word'],meanings[r['voca_id']],r['exam_en'] or '',r['exam_ko'] or '')
                if (en,ko)!=(r['exam_en'],r['exam_ko']) and ('target-word' in en or 'target-word' in ko):updates.append((en,ko,eid))
            print(f'preflight: untagged_examples={len(by_example)} locally_fixable={len(updates)} shared_skipped={shared}')
            if args.dry_run:print('[dry-run] 변경 없음.');return
            cur.executemany('UPDATE voca_example SET exam_en=%s,exam_ko=%s WHERE id=%s',updates)
            print(f'applied: {len(updates)}')
        conn.commit()
    except Exception:conn.rollback();raise
    finally:conn.close()
if __name__=='__main__':main()
