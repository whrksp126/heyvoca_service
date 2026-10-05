# 손맛 효과음 샘플

실제 악기 녹음을 가공해 큐별로 미리 렌더한 파일(WAV 24kHz mono 16-bit — mp3/aac 는 인코더 지연이
생겨 진동과의 타이밍이 어긋나므로 쓰지 않는다).

- 출처: VCSL (Versilian Community Sample Library, https://github.com/sgossner/VCSL) — CC0 1.0.
  - marimba: Struck Idiophones/Marimba (Outrigger, med)
  - kalimba: Plucked Idiophones/Kalimba, Kenya
- 음계: C 메이저 펜타토닉(C5 D5 E5 G5 A5 C6), 오답만 낮은 A3→F3(칼림바는 D4→B3).
- 각 큐의 음 시작 시각은 lib/feel/sfx.js 의 SFX_NOTE_STARTS_MS 와 같다(진동 패턴과 1:1).
