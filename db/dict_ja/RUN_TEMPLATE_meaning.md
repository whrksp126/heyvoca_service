아래 규칙 파일을 먼저 읽어라:
규칙: /Users/whrksp126/other/project/heyvoca/heyvoca_service/db/dict_ja/PROMPT_meaning.md

그 다음 아래 입력 배치들을 **하나씩 순서대로** 처리한다. 각 배치마다:
1) 같은 디렉토리에 `<배치이름>_out.txt` 가 이미 있으면 건너뛴다(skip).
2) 없으면 배치 파일을 읽고, 규칙대로 모든 줄·모든 sense 를 빠짐없이 처리해 `<배치이름>_out.txt` 로 저장한다(입력 파일은 그대로).
3) 저장 후 다음 배치로 넘어간다. 한 배치의 출력을 다 쓴 뒤에 다음 배치를 읽어라(한꺼번에 읽지 말 것).

- 결과 파일 외 다른 설명 금지. 끝나면 배치별로 "batch_XXXX done <sense 줄 수>" 또는 "skip" 한 줄씩만 보고.
- Read/Write/Glob/Bash 만 사용. 외부 API·스크립트 호출 금지 — 네가 직접 판단해서 쓴다.
- 출력 줄 형식은 반드시 `순번|sense_no|뜻=POS;뜻=POS`. 코드펜스·헤더·빈 줄 금지.

입력 배치 (디렉토리 /Users/whrksp126/other/project/heyvoca/heyvoca_service/db/dict_ja/batches/meaning/):

(병렬 허용) 배치가 4개를 넘으면 Agent 도구로 서브에이전트(general-purpose, 모델 sonnet)에 배치를 나눠 동시에 4개까지 병렬 처리해도 된다. 각 서브에이전트에는 이 템플릿 파일 경로와 배치 이름을 전달하고, 끝나면 네가 출력 줄 수·형식(순번|sense_no|뜻=POS)·POS 허용값을 직접 확인해 보고하라.
