#!/usr/bin/env python3
"""검수된 id/old/correct TSV를 병합 또는 표기 교정으로 적용한다."""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

import pymysql


def connect():
    p=urlparse(os.environ['DATABASE_URL_DICT'])
    return pymysql.connect(host=p.hostname,port=p.port or 3306,user=unquote(p.username or ''),
        password=unquote(p.password or ''),database=p.path.lstrip('/'),charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,autocommit=False)


def load(path):
    out=[]
    for no,line in enumerate(Path(path).read_text().splitlines(),1):
        if not line.strip() or line.startswith('#'):continue
        parts=line.split('\t')
        if len(parts)!=3:raise ValueError(f'{path}:{no}: id<TAB>old<TAB>correct')
        out.append((int(parts[0]),parts[1],parts[2]))
    return out


def main():
    ap=argparse.ArgumentParser();ap.add_argument('tsv')
    mode=ap.add_mutually_exclusive_group(required=True);mode.add_argument('--dry-run',action='store_true');mode.add_argument('--apply',action='store_true')
    args=ap.parse_args();plan=load(args.tsv);conn=connect()
    try:
        with conn.cursor() as cur:
            resolved=[];merge_n=rename_n=0
            for vid,old,new in plan:
                cur.execute('SELECT word FROM voca WHERE id=%s',(vid,));row=cur.fetchone()
                if not row or row['word']!=old:raise RuntimeError(f'{vid}: expected={old}, actual={row}')
                cur.execute('SELECT id,word FROM voca WHERE word=%s AND id<>%s ORDER BY id LIMIT 1',(new,vid));target=cur.fetchone()
                if target:merge_n+=1
                else:rename_n+=1
                resolved.append((vid,old,new,target['id'] if target else None))
            cur.execute('SELECT COUNT(*) n FROM admin_voca_book_map WHERE voca_id IN ('+','.join(['%s']*len(plan))+')',[p[0] for p in plan])
            admin_n=cur.fetchone()['n']
            print(f'preflight: rows={len(plan)} merge={merge_n} rename={rename_n} admin_maps={admin_n}')
            if args.dry_run:print('[dry-run] 변경 없음.');return
            affected=set();affected_admin=set()
            for vid,old,new,target in resolved:
                cur.execute('SELECT book_id FROM voca_book_map WHERE voca_id=%s',(vid,));affected.update(r['book_id'] for r in cur.fetchall())
                if target:
                    for table in ('voca_book_map','voca_meaning_map','voca_example_map'):
                        other={'voca_book_map':'book_id','voca_meaning_map':'meaning_id','voca_example_map':'example_id'}[table]
                        cur.execute(f'INSERT IGNORE INTO {table} (voca_id,{other}) SELECT %s,{other} FROM {table} WHERE voca_id=%s',(target,vid))
                    cur.execute('SELECT id,book_id,voca_meanings,voca_examples FROM admin_voca_book_map WHERE voca_id=%s',(vid,))
                    for old_map in cur.fetchall():
                        affected_admin.add(old_map['book_id'])
                        cur.execute('SELECT id,voca_meanings,voca_examples FROM admin_voca_book_map WHERE book_id=%s AND voca_id=%s',(old_map['book_id'],target))
                        target_map=cur.fetchone()
                        if target_map:
                            def merge_json(a,b):
                                out=[]
                                for raw in (a,b):
                                    try: vals=json.loads(raw or '[]')
                                    except Exception: vals=[]
                                    for value in vals:
                                        if value not in out:out.append(value)
                                return json.dumps(out,ensure_ascii=False)
                            cur.execute('UPDATE admin_voca_book_map SET voca_meanings=%s,voca_examples=%s WHERE id=%s',(
                                merge_json(target_map['voca_meanings'],old_map['voca_meanings']),
                                merge_json(target_map['voca_examples'],old_map['voca_examples']),target_map['id']))
                            cur.execute('DELETE FROM admin_voca_book_map WHERE id=%s',(old_map['id'],))
                        else:
                            cur.execute('UPDATE admin_voca_book_map SET voca_id=%s WHERE id=%s',(target,old_map['id']))
                    cur.execute('DELETE FROM voca WHERE id=%s',(vid,))
                else:
                    cur.execute('UPDATE voca SET word=%s WHERE id=%s',(new,vid))
                    cur.execute('UPDATE voca_label SET lemma=%s WHERE voca_id=%s',(new.casefold(),vid))
            cur.execute('DELETE m FROM voca_meaning m LEFT JOIN voca_meaning_map mm ON mm.meaning_id=m.id WHERE mm.meaning_id IS NULL')
            om=cur.rowcount
            cur.execute('DELETE e FROM voca_example e LEFT JOIN voca_example_map em ON em.example_id=e.id WHERE em.example_id IS NULL')
            oe=cur.rowcount
            for bid in affected:
                cur.execute('UPDATE voca_book SET word_count=(SELECT COUNT(*) FROM voca_book_map WHERE book_id=%s) WHERE id=%s',(bid,bid))
            for bid in affected_admin:
                cur.execute('UPDATE admin_voca_book SET word_count=(SELECT COUNT(*) FROM admin_voca_book_map WHERE book_id=%s) WHERE id=%s',(bid,bid))
            print(f'applied: affected_books={len(affected)} affected_admin_books={len(affected_admin)} orphan_meanings={om} orphan_examples={oe}')
        conn.commit()
    except Exception:conn.rollback();raise
    finally:conn.close()


if __name__=='__main__':main()
