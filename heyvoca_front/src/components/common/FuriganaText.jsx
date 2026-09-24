import React, { useMemo } from 'react';
import { useShowFurigana } from '../../context/ExampleSettingsContext';

/*
  일본어 예문 후리가나 렌더러.

  props
    html          원문(표준 강조 <strong class="target-word"> 포함 가능)
    readingTokens [[surface, reading|null(, okurigana)] ...] — 이어 붙이면 원문 plain 과 같다.
                  surface 는 송가나까지 포함한 표층이고, reading 은 한자 부분 읽기다.
    show          후리가나 표시 여부(생략 시 설정값 showFurigana)
    as/className  루트 태그·클래스(기존 dangerouslySetInnerHTML 요소를 그대로 대체)
    lang          루트 lang 속성(생략 시 readingTokens 가 있으면 'ja')

  strong 유지 방식
    1) html 을 DOM 파싱해 plain 텍스트와 target-word strong 구간의 [start,end) 오프셋(plain 기준)을 얻는다.
    2) 토큰을 순서대로 plain 위에 놓으며 조각(piece)으로 만든다.
         읽기 있는 토큰 → ruby 조각(한자부) + text 조각(송가나)
         읽기 없는 토큰 → text 조각
    3) text 조각은 strong 경계에서 잘라 나누고, ruby 조각은 원자 단위로 두되 strong 구간과 겹치면 강조로 본다.
    4) 강조 여부가 같은 연속 조각을 묶어 강조 묶음만 <strong class="target-word"> 로 감싼다.
    토큰 이어붙임이 plain 과 다르면(데이터 불일치) 후리가나 없이 원문 html 을 그대로 출력한다.
*/

const parseHtml = (html) => {
  const src = html == null ? '' : String(html);
  let plain = '';
  const ranges = [];
  if (typeof DOMParser === 'undefined') {
    // SSR 등 DOM 없는 환경 — 강조만 정규식으로 추출
    const re = /<strong\b[^>]*target-word[^>]*>([\s\S]*?)<\/strong\s*>/gi;
    let last = 0;
    let m;
    const strip = (s) => s.replace(/<[^>]*>/g, '');
    while ((m = re.exec(src))) {
      plain += strip(src.slice(last, m.index));
      const inner = strip(m[1]);
      ranges.push([plain.length, plain.length + inner.length]);
      plain += inner;
      last = m.index + m[0].length;
    }
    plain += strip(src.slice(last));
    return { plain, ranges };
  }
  const doc = new DOMParser().parseFromString(`<div>${src}</div>`, 'text/html');
  const walk = (node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        plain += child.nodeValue;
      } else if (child.nodeType === 1) {
        const isTarget =
          child.tagName === 'STRONG' && child.classList.contains('target-word');
        const start = plain.length;
        walk(child);
        if (isTarget && plain.length > start) ranges.push([start, plain.length]);
      }
    });
  };
  walk(doc.body.firstChild || doc.body);
  return { plain, ranges };
};

const buildPieces = (plain, tokens) => {
  const pieces = [];
  let pos = 0;
  for (const tok of tokens) {
    if (!Array.isArray(tok)) return null;
    const surface = tok[0] == null ? '' : String(tok[0]);
    const reading = tok[1];
    const okurigana = tok[2] ? String(tok[2]) : '';
    if (plain.slice(pos, pos + surface.length) !== surface) return null;
    if (reading && surface) {
      const hasOkuri = okurigana && surface.endsWith(okurigana) && surface.length > okurigana.length;
      const base = hasOkuri ? surface.slice(0, surface.length - okurigana.length) : surface;
      pieces.push({ type: 'ruby', text: base, rt: String(reading), start: pos, end: pos + base.length });
      if (hasOkuri) {
        pieces.push({ type: 'text', text: okurigana, start: pos + base.length, end: pos + surface.length });
      }
    } else if (surface) {
      pieces.push({ type: 'text', text: surface, start: pos, end: pos + surface.length });
    }
    pos += surface.length;
  }
  if (pos !== plain.length) return null;
  return pieces;
};

const inRanges = (ranges, s, e) => ranges.some(([rs, re]) => s < re && e > rs);

const markStrong = (pieces, ranges) => {
  if (!ranges.length) return pieces.map((p) => ({ ...p, strong: false }));
  const cuts = new Set();
  ranges.forEach(([s, e]) => { cuts.add(s); cuts.add(e); });
  const out = [];
  for (const p of pieces) {
    if (p.type === 'ruby') {
      out.push({ ...p, strong: inRanges(ranges, p.start, p.end) });
      continue;
    }
    const points = [p.start, ...[...cuts].filter((c) => c > p.start && c < p.end).sort((a, b) => a - b), p.end];
    for (let i = 0; i < points.length - 1; i += 1) {
      const s = points[i];
      const e = points[i + 1];
      out.push({
        type: 'text',
        text: p.text.slice(s - p.start, e - p.start),
        start: s,
        end: e,
        strong: inRanges(ranges, s, e),
      });
    }
  }
  return out;
};

const renderPiece = (p, key) =>
  p.type === 'ruby' ? (
    <ruby key={key}>
      {p.text}
      <rt>{p.rt}</rt>
    </ruby>
  ) : (
    <React.Fragment key={key}>{p.text}</React.Fragment>
  );

const FuriganaText = ({
  html,
  readingTokens,
  show,
  as: Tag = 'span',
  className,
  lang,
  ...rest
}) => {
  const settingShow = useShowFurigana();
  const effectiveShow = show ?? settingShow;
  const hasTokens = Array.isArray(readingTokens) && readingTokens.length > 0;
  const rootLang = lang ?? (hasTokens ? 'ja' : undefined);

  const groups = useMemo(() => {
    if (!effectiveShow || !hasTokens) return null;
    const { plain, ranges } = parseHtml(html);
    const pieces = buildPieces(plain, readingTokens);
    if (!pieces) return null;
    const marked = markStrong(pieces, ranges);
    const grouped = [];
    for (const p of marked) {
      const last = grouped[grouped.length - 1];
      if (last && last.strong === p.strong) last.items.push(p);
      else grouped.push({ strong: p.strong, items: [p] });
    }
    return grouped;
  }, [html, readingTokens, effectiveShow, hasTokens]);

  if (!groups) {
    return (
      <Tag
        className={className}
        lang={rootLang}
        {...rest}
        dangerouslySetInnerHTML={{ __html: html ?? '' }}
      />
    );
  }

  return (
    <Tag className={className} lang={rootLang} {...rest}>
      {groups.map((g, gi) =>
        g.strong ? (
          <strong key={gi} className="target-word">
            {g.items.map((p, pi) => renderPiece(p, pi))}
          </strong>
        ) : (
          <React.Fragment key={gi}>{g.items.map((p, pi) => renderPiece(p, pi))}</React.Fragment>
        )
      )}
    </Tag>
  );
};

export default FuriganaText;
