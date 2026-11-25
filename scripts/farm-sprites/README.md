# 농장 스프라이트 생성
`npm i` 후 `node gen.mjs crop corn` 처럼 한 개로 먼저 품질 확인 → `node gen.mjs` 전체.
결과: `heyvoca_front/src/assets/farm2/` (작물 `{id}_{0..3}.png`, 아이템 `{id}.png`, 원본 시트 `_sheet_*.png`는 검수용·커밋 제외).
생성 후 `manifest.json` 의 src 를 채우면 Pixi 폴백 도형 대신 그림이 쓰인다.
모델/품질: `IMG_MODEL`, `IMG_QUALITY`(low|medium|high) 환경변수. 필요: OpenAI 프로젝트에 gpt-image-2.6-sunburst 허용(초안은 IMG_MODEL=gpt-image-2.6-flare).
