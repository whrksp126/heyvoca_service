# 실험실 '내 농장 꾸미기' 계약 (2026-11-25)

타이니팜식 아이소메트릭 농장 홈. **실험실 토글 `farm_home` 을 켠 사용자에게만** 노출한다.
그림은 임시 자산으로 시작하고, 나중에 AI 생성 스프라이트로 **파일만 교체**한다(코드 수정 없이).

## 1. 아이템 카탈로그 (백엔드 정본: `heyvoca_back/app/data/farm_catalog.json`)

```json
{ "id": "tree_round", "category": "tree", "name": "둥근 나무",
  "w": 1, "h": 1, "price_gem": 5,
  "unlock": null,                // 또는 {"type":"streak","value":7} | {"type":"words_learned","value":500}
  "starter_qty": 2 }             // 처음 지급 수량(0이면 없음)
```

category: `field`(단어장 밭) · `crop`(작물 종류, 배치 아님) · `tree` · `fence` · `deco` · `animal` · `ground`

초기 목록(id / 크기 / 가격 / 해금 / 처음 지급):
- crop(밭에 심는 작물 종류, 가격 0, 배치 불가): carrot, corn, rice, cucumber, tomato, pumpkin, radish, strawberry
- field: `field` 3×3 — 단어장 밭. 단어장 1개당 1개, 수량 제한은 단어장 수
- tree: tree_round 1×1 5보석 starter 2 · tree_pine 1×1 5 · tree_apple 1×1 12
- fence: fence_wood 1×1 1보석 starter 8 · fence_stone 1×1 2
- deco: scarecrow 1×1 8 starter 1 · mailbox 1×1 6 starter 1 · bench 1×1 6 · well 1×1 15 · flower_bed 1×1 4 · lamp 1×1 6 · signboard 1×1 5 · windmill 2×2 40 (words_learned 500)
- ground: path_tile 1×1 1 · pond 2×2 20
- animal: chicken 1×1 starter 1 · sheep 1×1 25 · cat 1×1 20 · dog 1×1 0 (streak 7) · cow 1×1 0 (streak 30)

해금 조건이 있고 가격 0인 아이템은 조건 달성 시 1개 **자동 지급**(멱등).

## 2. 사용자 DB (heyvoca_user, `migrations/`)

- `user_farm_layout` — user_id PK, `layout` JSON, `version` int, `updated_at`
  - layout 항목: `{ "uid": "문자열", "item_id": "tree_round", "x": 3, "y": 5, "flip": false, "book_id": 12|null }`
  - 격자 크기 24×24 (0..23). 밭(`field`)은 `book_id` 필수
- `user_farm_inventory` — (user_id, item_id) PK, `qty` int (보유 총수. 배치 수 ≤ qty)
- `user_voca_book.crop_type` VARCHAR(20) NULL — NULL이면 carrot

## 3. 사전 DB (heyvoca_dict, `migrations_dict/`)

- 서점 단어장(어드민이 서점에 내는 단어장 모델)에 `crop_type` VARCHAR(20) NULL 추가
- 사용자가 서점 단어장을 담을 때 `user_voca_book.crop_type` 에 복사
- 어드민 단어장 편집 API·화면에서 crop_type 선택 가능

## 4. API (모두 `@token_required`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/farm/state` | `{catalog, inventory:{item_id:qty}, layout, version, books:[{id,name,crop_type,word_count,stages:{seed,sprout,...}}], gem, stats:{streak, words_learned}}` — 처음 호출 시 starter 지급 + 단어장 밭 자동 배치(겹치지 않게), 해금 지급 |
| PUT | `/farm/layout` | body `{layout, version}` → 검증(보유 수량·격자 범위·겹침·밭 book_id 소유) 후 저장, version+1. version 불일치 409 |
| POST | `/farm/shop/buy` | body `{item_id}` → 기존 `change_gem` 단일 경로로 차감(User 먼저 잠금), inventory+1. 보석 부족 400 |
| PATCH | `/farm/books/<id>/crop` | body `{crop_type}` → 본인 단어장만 |

`stages` 는 기존 작물 XP 단계(씨앗~수확 5단계) 기준 단어 수 집계. 기존 함수 재사용.

## 5. 실험실 토글

기존 lab settings 에 `farm_home`(기본 false) 추가. 백엔드 허용 키 목록 + 프론트 `LabNewFullSheet` 항목:
제목 "내 농장 꾸미기", 설명 "홈을 꾸밀 수 있는 농장으로 바꿔요".

## 6. 프론트 화면

- `pixi.js` v8, 농장 화면만 동적 import(초기 번들 영향 없음)
- `farm_home` on → 홈 본문이 FarmHome 으로 교체. 상단 칩([언어]…[불꽃][보석])은 유지, 기존 오늘 할 일 카드는 하단 접이식으로
- 농장: 2:1 아이소 격자 타일 64×32, 확대(두 손가락, 0.6~2.0)·이동(끌기), 깊이 정렬 x+y
  - 밭: 단어장 밭 3×3, 안에 작물 단계별 스프라이트(단계 분포대로), 탭 → 해당 단어장 열기
  - 동물: 빈 칸으로 천천히 이동 + 통통 튀기, 탭하면 점프
  - 분위기: 구름 그림자 이동, 바람 흔들림(나무·작물 살짝 기울기), 탭 반짝임 파티클
- 꾸미기 모드: 하단 서랍 탭(밭·나무·울타리·장식·땅·동물·상점) → 끌어다 놓기, 놓을 수 없으면 빨간 발판, 뒤집기·보관 버튼, 저장/취소
  - 밭 선택 시 작물 종류 바꾸기(PATCH)
  - 상점 탭: 가격·해금 조건 표시, 구매 → POST buy
- 디자인 토큰·Phosphor 아이콘만, 이모지 금지

## 7. 자산 교체 구조 (중요)

`heyvoca_front/src/assets/farm2/manifest.json` 하나가 모든 그림을 정의:
```json
{ "tile": {"w":64,"h":32},
  "items": { "tree_round": {"src":"tree_round.png","anchor":[0.5,1],"scale":1} },
  "crops": { "carrot": {"stages":["carrot_0.png", "...5개"], "anchor":[0.5,1]} } }
```
임시 자산: 기존 `assets/images/farm/` 그림(당근 단계, field-base 등) 재사용, 없는 건 Pixi Graphics 로 간단한 도형(색·그림자 있는 2.5D 느낌)을 그려 둔다 — manifest 에 `src` 가 없으면 도형 폴백. 나중에 PNG 를 넣고 manifest 만 바꾸면 교체된다.
