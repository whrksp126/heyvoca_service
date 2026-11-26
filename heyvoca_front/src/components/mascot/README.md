# 헤이 (마스코트)

헤이보카 마스코트 토끼를 포즈별로 쓰는 컴포넌트. 그림은 전부 SVG, 움직임은 CSS 다(이미지·Lottie·Rive 없음).

| 파일 | 역할 |
|------|------|
| `Hey.jsx` | 그림. 자세·표정·소품을 SVG 로 그린다 |
| `heyPoses.js` | 포즈 정의(팔·귀 각도, 표정, 소품)와 홈 포즈 규칙 `resolveHomeHeyPose` |
| `hey.css` | 포즈별 움직임(@keyframes). 전부 `.hey` 아래로 가둬 둔다 |
| `HeyPreview.jsx` | 미리보기 화면 — 로컬에서 `/dev/hey` |

## 쓰기

```jsx
import Hey from '@/components/mascot/Hey';

<Hey pose="wave" size={120} />                 // 폭 120px (높이는 4:5 로 따라온다)
<Hey pose="think" />                           // size 를 안 주면 부모 상자를 채운다
<Hey pose={pose} onTap={() => vibrate({ duration: 5 })} label="헤이" />   // 탭하면 폴짝
<Hey pose="water" flip shadow={false} />       // 좌우 반전, 그림자 끔
```

| prop | 기본 | 설명 |
|------|------|------|
| `pose` | `'idle'` | 아래 표의 키. 모르는 값이면 `idle` |
| `size` | 없음 | 폭(px). 없으면 부모를 채우므로 **크기를 정한 상자로 감쌀 것** |
| `flip` | `false` | 좌우 반전. 소품이 왼쪽으로 간다(글자 Z 는 안 뒤집힌다) |
| `shadow` | `true` | 발밑 그림자. 바깥에서 따로 그리는 곳(농장 밭)은 끈다 |
| `paused` | `false` | 움직임 강제 정지. 화면 밖이면 알아서 멈춘다 |
| `onTap` | 없음 | 주면 버튼이 되고, 탭하면 0.9초 반응(폴짝 + 반짝임) 뒤 `onTap(pose)` |
| `label` | 없음 | 스크린리더용 이름. 장식이면 비워 둔다 |

## 포즈

| 키 | 이름 | 쓰는 자리 |
|----|------|-----------|
| `idle` | 기본 대기 | 숨쉬기·눈 깜빡임·귀 까딱. 불러오기 전 기본값 |
| `wave` | 인사 | 빈 밭, 첫 만남 |
| `water` | 물 주기 | 돌볼 작물이 남았을 때 |
| `plant` | 씨앗 심기 | 새 씨앗을 심을 차례 |
| `joy` | 기뻐하기 | 오늘 할 일 완료, 좋은 소식의 빈 상태 |
| `cheer` | 응원 | 돌봄이 3개 이하로 남았을 때 |
| `worry` | 시무룩·걱정 | 썩기 직전 작물이 있을 때 |
| `sleepy` | 졸림 | 밤(22~05시)에 할 일을 다 끝냈을 때 |
| `think` | 생각 중 | 로딩·대기 화면 |

## 지금 쓰는 곳

- 홈 농장 밭: `home/Main.jsx` → `farm/FarmHero.jsx`(`heyPose`·`onHeyTap`) → `farm/FarmField.jsx`(`mascotNode`).
  포즈 규칙은 `resolveHomeHeyPose` 하나에 있다 — 위기 > 남은 일 > 완료 순, 밤에는 다 끝낸 뒤에만 존다.
  이미 썩은 단어는 보지 않는다(살릴 때까지 남아 있어 헤이가 며칠씩 시무룩해진다).
- 로딩: `common/ProgressSplash.jsx` — `think`
- 빈 상태: `farm/RottenListSheet.jsx` — `joy`

## 포즈 추가하기

1. `heyPoses.js` 의 `HEY_POSES` 에 자세를 적는다. 각도는 "늘어뜨린 팔 / 곧게 선 귀 = 0°"에서 시계 방향.
   올린 팔이 머리에 가리면 `armsFront: true`.
2. 새 소품이 필요하면 `Hey.jsx` 에 `def.prop === '...'` 분기로 그린다. 움직이는 부위는 `Joint` 로 감싸
   **관절이 원점**이 되게 그린다(CSS 에서 transform-origin 을 안 써도 된다).
3. `hey.css` 에 `.hey[data-pose='키'] .hey-부위 { animation: ... }` 를 얹는다. transform·opacity 만 움직일 것.
4. `/dev/hey` 에서 라이트·다크, 그리고 "멈추기"(모션을 끈 기기와 같은 모습)로 확인한다.

## 지킬 것

- **자세는 SVG 속성, 움직임은 CSS.** 모션을 끈 기기(`prefers-reduced-motion`)에서는 애니메이션만 꺼지므로
  멈춘 그림만으로도 포즈가 읽혀야 한다.
- 캐릭터 색(크림빛 털 · 분홍 귀 안쪽과 볼 · 초록 잎 스카프 · 주황 멜빵)은 테마와 무관하게 고정이다.
  그림자·말풍선·Zzz 같은 주변 효과만 `.dark` 에서 바뀐다.
- 옛 3D 풍 PNG(`assets/images/farm/mascot-*.png`)와 한 화면에 섞지 않는다. 온보딩은 아직 옛 그림을 쓴다.
- `hey.css` 는 "Tailwind 만 쓴다"는 프론트 규칙의 예외다. 포즈별 @keyframes 를 공용
  `tailwind.config.js` 에 넣지 않으려고 컴포넌트 옆에 뒀다.
