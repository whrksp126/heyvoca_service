#!/usr/bin/env python3
"""오류 뜻 제거 후 빈 정상 단어에 뜻을 복구하고 페이지 마커만 삭제한다."""
import argparse,os
from urllib.parse import unquote,urlparse
import pymysql
MEANINGS={
5387:['조명','불빛'],6190:['마무리'],13620:['갈보리','시련'],15034:['조난자','버림받은 사람'],
15043:['여성 혐오적인'],21372:['무훈','이야기'],28968:['선제적인'],30672:['변형하다'],31046:['성전 기사단원'],
34936:['양장본'],35264:['투명함','명료함'],35268:['전멸','완패'],39069:['광산 수직갱'],39253:['필자명','기사 작성자 표시'],
41164:['팽창'],41331:['배열된'],41336:['무오류성'],42929:['장애물들'],43386:['부동태화'],46334:[],48469:['에베소서','에베소 사람들'],
48470:['배회하는'],48472:['캠던'],48495:['탈장된'],48508:['닳은','마모된'],50523:['암호'],50526:['두 번의','배신하다'],
50527:['탐험하는'],50528:['내기들'],50529:['소화하기 쉬운'],52485:['감사'],52486:['흡수성'],52487:['상냥함']}
DELETE={34889:'page107-108',34891:'p91-92',34894:'p79-80',34896:'page72-73',34897:'p.59-60',34899:'p55-56',34901:'page47-48',34902:'p.41-42',34903:'page39-40',34918:'page17-18',34922:'page9-10',46334:'neg'}
def conn():
 p=urlparse(os.environ['DATABASE_URL_DICT']);return pymysql.connect(host=p.hostname,port=p.port or 3306,user=unquote(p.username or ''),password=unquote(p.password or ''),database=p.path.lstrip('/'),charset='utf8mb4',cursorclass=pymysql.cursors.DictCursor,autocommit=False)
def main():
 ap=argparse.ArgumentParser();m=ap.add_mutually_exclusive_group(required=True);m.add_argument('--dry-run',action='store_true');m.add_argument('--apply',action='store_true');a=ap.parse_args();c=conn()
 try:
  with c.cursor() as cur:
   affected=set()
   for vid,word in DELETE.items():
    cur.execute('SELECT word FROM voca WHERE id=%s',(vid,));r=cur.fetchone()
    if not r or r['word']!=word:raise RuntimeError((vid,word,r))
    cur.execute('SELECT book_id FROM voca_book_map WHERE voca_id=%s',(vid,));affected.update(x['book_id'] for x in cur.fetchall())
   for vid,vals in MEANINGS.items():
    if not vals:continue
    cur.execute('SELECT id FROM voca WHERE id=%s',(vid,))
    if not cur.fetchone():raise RuntimeError(f'missing {vid}')
   print(f'preflight: delete={len(DELETE)} repair={sum(bool(v) for v in MEANINGS.values())} affected_books={len(affected)}')
   if a.dry_run:print('[dry-run] 변경 없음.');return
   for vid,vals in MEANINGS.items():
    for text in vals:
     cur.execute('SELECT id FROM voca_meaning WHERE meaning=%s ORDER BY id LIMIT 1',(text,));r=cur.fetchone()
     if r:mid=r['id']
     else:cur.execute('INSERT INTO voca_meaning (meaning,pos) VALUES (%s,NULL)',(text,));mid=cur.lastrowid
     cur.execute('INSERT IGNORE INTO voca_meaning_map (voca_id,meaning_id) VALUES (%s,%s)',(vid,mid))
   cur.execute('DELETE FROM voca WHERE id IN ('+','.join(['%s']*len(DELETE))+')',list(DELETE))
   for bid in affected:cur.execute('UPDATE voca_book SET word_count=(SELECT COUNT(*) FROM voca_book_map WHERE book_id=%s) WHERE id=%s',(bid,bid))
   print('applied')
  c.commit()
 except Exception:c.rollback();raise
 finally:c.close()
if __name__=='__main__':main()
