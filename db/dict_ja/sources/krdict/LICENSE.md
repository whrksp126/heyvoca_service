# 출처 · 라이선스 — 국립국어원 한국어기초사전 (krdict)

## 데이터 출처

- **제공처**: 국립국어원(National Institute of Korean Language) 한국어기초사전(krdict)
- **사이트**: https://krdict.korean.go.kr
- **다운로드 경로**: 사이트 우측/하단 "사전 전체 내려받기" 팝업
  (`https://krdict.korean.go.kr/download/downloadPopup`) → **"Json 전체 내려받기"**
  버튼 → 실제 다운로드 URL `https://krdict.korean.go.kr/dicBatchDownload?seq=217`
- **로그인/오픈 API 인증키: 불필요.** 위 경로는 완전 공개·비로그인 다운로드다
  (오픈 API 발급 절차는 조사했으나 이 데이터 확보에는 사용하지 않았다 — 아래 "조사했지만
  쓰지 않은 경로" 참고).
- **받은 파일**: `krdict_json_full.zip` (약 97MB, 11개 JSON 파트: `1_5000_*.json` ~
  `11_3671_*.json`, 표제어 총 56,555건/고유 표기 51,909개)
- **원본 상단 메타데이터**: `"한국어기초사전 - 국립국어원 제공"`,
  `creationDate: 2026/09/19 12:40:11`
- **다운로드 실행일**: 2026-09-24

## 데이터 형식 (참고)

각 표제어(`LexicalEntry`)는 품사·급수·발음 등과 함께 여러 `Sense`(뜻풀이)를 가지고,
각 `Sense`는 11개 언어(영어/일본어/중국어/베트남어/타이어/인도네시아어/러시아어/
프랑스어/스페인어/아랍어/몽골어)의 `Equivalent`(대역어 + 대역 언어 정의)를 포함한다.
이 저장소에서는 그중 **일본어(`language: "일본어"`) 대역어만** 추출해
`build/krdict_ja_reverse.json`(일본어 표제 → 한국어 표제어 역방향 인덱스)을 생성했다
(생성 스크립트: `scripts/05_build_krdict_reverse.py`, 분리·파싱 규칙은 스크립트
docstring에 상세 기술).

## 라이선스

- **Creative Commons 저작자표시-동일조건변경허락 2.0 대한민국
  (CC BY-SA 2.0 KR)** — https://creativecommons.org/licenses/by-sa/2.0/kr/
  (출처: https://krdict.korean.go.kr/kor/kboardPolicy/copyRightTermsInfo)
- 텍스트 자료(표제어·뜻풀이·대역어·예문 등)는 **상업적 이용 포함 자유 이용 가능**하나
  다음 두 조건을 반드시 충족해야 한다.
  1. **저작자 표시**: 출처(국립국어원 한국어기초사전)와 저작권자를 명확히 밝힐 것
  2. **동일조건변경허락**: 이 데이터를 가공·수정해 만든 2차 저작물(본 저장소의
     `krdict_ja_reverse.json` 포함)도 **동일한 CC BY-SA 2.0 KR 라이선스**로 배포해야 함
- **예외**: 발음 음성 파일 등 멀티미디어는 개별 저작권이 별도 설정되어 있어 별도 확인
  필요(이번 작업은 텍스트만 사용, 음성 파일 미사용).

### 출처 표기 문구(권장)

> 이 자료는 국립국어원 한국어기초사전(krdict.korean.go.kr)의 데이터를 CC BY-SA 2.0 KR
> 라이선스에 따라 활용하였습니다. (국립국어원 한국어기초사전 제공, 다운로드일
> 2026-09-24)

## 용도 및 범위 (이 저장소 내)

- **용도**: heyvoca 일한사전(`heyvoca_dict_ja`) 표제어·뜻풀이의 **외부 검증용
  대조 데이터**로만 사용한다. 이 데이터를 직접 서비스에 노출하거나 그대로 재배포하지
  않는다(PLAN.md 기준 — 서비스 데이터의 골격은 JMdict/Tatoeba 기반으로 별도 생성).
- 만약 향후 이 데이터(또는 이를 가공한 결과물)를 서비스나 공개 저장소에 배포하게 되면
  위 CC BY-SA 2.0 KR 조건(출처 표시 + 동일 라이선스 배포)을 반드시 지켜야 한다.

## 조사했지만 쓰지 않은 경로 (참고용 기록)

- **오픈 API** (`https://krdict.korean.go.kr/kor/openApi/openApiInfo`,
  신청: `https://krdict.korean.go.kr/kor/openApi/openApiRegister`): 이메일 주소만
  입력하면 인증키 발급(로그인/회원가입 불필요해 보임), 일일 호출 한도 50,000건,
  검색 API(`/api/search`, `translated=y&trans_lang=2`가 일본어)와 상세정보 API
  (`/api/view`)를 제공. 응답은 XML만. **건별 검색 API라 5만여 표제어 전체를
  받으려면 다건 호출이 필요** — 이번엔 로그인 없이 받을 수 있는 "사전 전체
  내려받기"(JSON) 쪽이 더 간단하고 완전해서 이 경로는 실제로 쓰지 않았다.
- **공공데이터포털(data.go.kr)** `문화체육관광부 국립국어원_한국어기초사전`
  (https://www.data.go.kr/data/15040738/openapi.do): 개발/운영 모두 **자동승인**이라고
  안내되나 data.go.kr 회원가입/로그인이 필요해 이번 작업에서는 시도하지 않았다.
- **한국어-일본어 학습사전 UI 전용 다운로드**
  (`https://krdict.korean.go.kr/jpn/download/downloadPopup` 등): 존재하지 않음(404).
    일본어 UI(`/jpn/...`)는 검색/열람용이며, 별도 벌크 다운로드는 제공하지 않는다.
    대신 위에서 받은 **"사전 전체 내려받기"(한국어 UI) JSON 안에 11개 언어 대역어가
    전부 포함**되어 있어 이 파일 하나로 충분했다.
