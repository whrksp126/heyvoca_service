import { useRef, useState, useEffect } from 'react';
import { getWordInfoFromKoreanApi } from '../api/search';
import { haptic } from '../lib/feel';

/*
  한국어 예문 카드(문장 만들기·빈칸 채우기 위쪽 보라색 카드) 속 어절을 탭했을 때 쓰는
  사전 역방향 조회(?from=ko&q=) 말풍선 상태 훅. 영어 단어 탭(WordInfoBubble 단일 모드,
  getWordInfoApi)과 달리 결과가 배열(최대 3개)이라 info 대신 results 를 들고 있다가
  WordInfoBubble(results prop)에 그대로 넘긴다. 한국어라 TTS 는 재생하지 않는다.

  WordInfoBubble 는 document.body 포털 + position:fixed 로 그리므로(2026-09-29, 카드
  overflow-hidden 에 잘리는 문제 수정), anchor 는 탭한 어절의 뷰포트 기준
  getBoundingClientRect() 를 그대로 쓴다 — 카드 DOM ref 가 더 이상 필요 없다.
*/
export const useKoreanWordLookup = () => {
  const [lookup, setLookup] = useState(null);
  const reqRef = useRef(0);

  const closeLookup = () => {
    reqRef.current += 1;
    setLookup((prev) => (prev ? null : prev));
  };

  const handleTap = (e, key, word) => {
    e.stopPropagation();
    if (lookup?.key === key) {
      closeLookup();
      return;
    }
    const wordEl = e.currentTarget;
    if (!wordEl) return;
    const wordRect = wordEl.getBoundingClientRect();
    const anchor = {
      top: wordRect.top,
      left: wordRect.left,
      width: wordRect.width,
      height: wordRect.height,
    };

    haptic('light');

    const reqId = ++reqRef.current;
    setLookup({ key, anchor, status: 'loading', results: null });
    getWordInfoFromKoreanApi(word)
      .then((results) => {
        if (reqId !== reqRef.current) return;
        setLookup((prev) => (prev && prev.key === key
          ? { ...prev, status: Array.isArray(results) && results.length > 0 ? 'found' : 'notFound', results }
          : prev));
      })
      .catch(() => {
        if (reqId !== reqRef.current) return;
        setLookup((prev) => (prev && prev.key === key ? { ...prev, status: 'error' } : prev));
      });
  };

  // 말풍선 닫기 — 바깥 탭·스크롤(WordInfoBubble의 기존 영어 단어 조회 훅들과 동일 규칙).
  useEffect(() => {
    if (!lookup) return undefined;
    const onPointerDown = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) { closeLookup(); return; }
      if (t.closest('[data-word-info-bubble]')) return;
      if (t.closest('[data-ko-lookup-word]')) return;
      closeLookup();
    };
    const onScroll = () => closeLookup();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup?.key]);

  return { lookup, handleTap, closeLookup };
};
