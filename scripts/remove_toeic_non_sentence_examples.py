#!/usr/bin/env python3
"""TOEIC import에서 예문으로 들어온 동의어·반의어·파생어 메모를 제거한다."""
import argparse,json,os
from urllib.parse import unquote,urlparse
import pymysql
SOURCE='해커스 토익 기초 보카'
def conn():
 p=urlparse(os.environ['DATABASE_URL_DICT']);return pymysql.connect(host=p.hostname,port=p.port or 3306,user=unquote(p.username or ''),password=unquote(p.password or ''),database=p.path.lstrip('/'),charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,autocommit=False)
def main():
 ap=argparse.ArgumentParser();m=ap.add_mutually_exclusive_group(required=True);m.add_argument('--dry-run',action='store_true');m.add_argument('--apply',action='store_true');a=ap.parse_args();c=conn()
 try:
  with c.cursor() as cur:
   cur.execute('''SELECT DISTINCT e.id FROM voca_example e JOIN voca_example_map em ON em.example_id=e.id
      JOIN admin_voca_book_map am ON am.voca_id=em.voca_id JOIN admin_voca_book b ON b.id=am.book_id
      WHERE b.source=%s AND e.exam_en<>'' AND e.exam_en NOT LIKE '%%target-word%%' ''',(SOURCE,))
   ids=[r['id'] for r in cur.fetchall()]
   cur.execute('''SELECT am.id,am.voca_examples FROM admin_voca_book_map am JOIN admin_voca_book b ON b.id=am.book_id
                  WHERE b.source=%s AND am.voca_examples IS NOT NULL''',(SOURCE,))
   updates=[];removed_json=0
   for row in cur.fetchall():
    try:items=json.loads(row['voca_examples'] or '[]')
    except Exception:continue
    kept=[x for x in items if 'target-word' in str(x.get('origin',x.get('en','')))]
    if len(kept)!=len(items):updates.append((json.dumps(kept,ensure_ascii=False),row['id']));removed_json+=len(items)-len(kept)
   print(f'preflight: global_examples={len(ids)} admin_json_items={removed_json} maps_updated={len(updates)}')
   if a.dry_run:print('[dry-run] 변경 없음.');return
   cur.executemany('UPDATE admin_voca_book_map SET voca_examples=%s WHERE id=%s',updates)
   if ids:
    ph=','.join(['%s']*len(ids));cur.execute(f'DELETE FROM voca_example WHERE id IN ({ph})',ids)
   print('applied')
  c.commit()
 except Exception:c.rollback();raise
 finally:c.close()
if __name__=='__main__':main()
