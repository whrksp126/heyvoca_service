# HeyVoca Rive contract

`RiveFarmActor`는 화면과 `.riv` 파일 사이의 어댑터다. 화면 컴포넌트가 Rive의 입력 이름을 직접 참조하지 않게 한다.

## 캐릭터 원본

- 기준 에셋: [Interactive Bunny Character](https://rive.app/marketplace/24876-46460-interactive-bunny-character/) by raivu
- 라이선스: CC BY 4.0 (수정 및 상업적 사용 가능, 저작자 표시와 변경 사실 표기 필요)
- 편집 원본: `public/motion-assets/interactive-bunny-base.rev`

`.rev`는 Rive 편집 문서이므로 브라우저 런타임에 직접 전달하지 않는다. Marketplace에서 Remix한 뒤 헤이보카 스타일과 아래 계약을 적용하고, 최종 산출물을 `.riv`로 내보내 웹에서 사용한다.

## Rive 파일 규격 v1

- State machine: `HeyVocaFarm`
- Artboard 권장 크기: `800 × 800`
- 원점: 캐릭터 발바닥 중앙
- 숫자 입력: `mood`, `moveX`, `growth`, `health`, `wind`
- Boolean 입력: `walking`
- Trigger 입력: `ears`, `jump`, `water`, `celebrate`

값 범위와 의미는 `farmMotionContract.js`가 단일 기준이다.

## 화면 사용 예시

```jsx
const actorRef = useRef(null);

<RiveFarmActor ref={actorRef} src="/motion/heyvoca-farm-v1.riv" />

actorRef.current?.play('happy');
actorRef.current?.play('walk', { x: 0.8, active: true });
actorRef.current?.play('water');
actorRef.current?.setCrop({ growth: 2, health: 3, wind: 0.25 });
```

## 동작 제작 규칙

- `idle`, `walking`, 바람은 반복 가능한 루프다.
- `ears`, `jump`, `water`, `celebrate`는 Trigger로 시작하고 완료 후 기본 상태로 복귀한다.
- 표정은 몸 동작과 동시에 재생될 수 있어야 한다.
- 물주기는 캐릭터 애니메이션과 작물의 물 흡수 타임라인이 같은 이벤트를 사용한다.
- 모든 루프는 첫 프레임과 마지막 프레임의 포즈·속도가 이어져야 한다.
