# cappl-pals for Codex

Claude Code용 `mod/`를 변경하지 않고 원본 등록 코드와 규칙·캐릭터·애니메이션·음원을
Codex용 런타임으로 빌드합니다. Codex 훅이 작업 이벤트를 전달하고 로컬 동반 창에서
세 친구, 쓰다듬기, 재주, 간식, 레벨·계급·팬, 골드, 레벨 상자, 행운의 사금,
현상금, 상점·옷장, 보상표·진행도, 한국어·영어, 효과음 설정을 사용합니다.

## 빌드와 설치

빌드에는 Bun, 실행에는 Node.js 22 이상이 필요합니다. 저장소 루트에서:

```sh
bun run --cwd codex build
bun run --cwd codex test
codex plugin marketplace add "$PWD"
codex plugin add cappl-pals-codex@cappl-pals-codex-dev
```

데스크톱 앱을 재시작하고 새 Codex 대화를 엽니다. Codex에서 플러그인의 훅 정의를
검토하고 신뢰해야 자동 이벤트가 실행됩니다. 설치만으로 훅 신뢰를 자동 승인하지
않습니다. 플러그인은 권한 판단을 변경하거나 작업을 차단하지 않습니다.

동반 창을 직접 열려면:

```sh
node codex/dist/cli.mjs open
```

설치된 플러그인의 `cappl` 스킬에도 같은 실행 안내가 들어 있습니다. 창 상단에서
Codex 세션과 언어를 고릅니다. 캐릭터·골드·옷장은 모든 세션이 공유합니다.
상태 확인 등은 `node codex/dist/cli.mjs command cappl-status`로도 됩니다.
다른 명령: `cappl`, `cappl-pick caro`, `cappl-rules`, `cappl-sound`.
CLI에서 `CAPPL_PALS_SESSION`을 지정하면 해당 세션을 선택합니다.

변경 후에는 다시 빌드하고 `codex plugin add cappl-pals-codex@cappl-pals-codex-dev`로
설치본을 갱신한 뒤 데스크톱 앱을 재시작합니다. 실행 중인 동반 서버도
`node codex/dist/cli.mjs stop`으로 종료한 다음 다시 엽니다.

## Orca 터미널 옆 패널

Orca 데스크톱 1.4.246 이상에서는 브라우저 대신 오른쪽 플러그인 패널에 띄울 수
있습니다. 같은 컴퓨터에 Node.js 22 이상이 PATH에 있어야 합니다. 저장소 루트에서:

```sh
bun run --cwd codex build
orca plugin validate "$PWD/codex/dist/orca" --json
orca plugin inspect "$PWD/codex/dist/orca" --json
orca plugin dev load "$PWD/codex/dist/orca" --json
```

처음 로드하면 `approval_required`와 권한 목록, 승인 fingerprint가 나옵니다.
목록을 검토한 뒤 출력된 명령의 `--approve <fingerprint>`로 승인합니다.
브리지는 사용자 계정 권한으로 별도 Node 프로세스를 실행하지만 Orca의 터미널
읽기·입력 등 host capability는 요청하지 않습니다. 개발 폴더의 이후 코드 수정도
실행되므로 신뢰하는 소스 경로를 사용하세요. 승인 후 작업공간을 연 상태에서:

```sh
orca plugin open local.cappl-pals-orca --panel companion --json
```

이 패널은 Codex 자체 패널이 아니라 Orca 사이드바입니다. 기존 Codex 훅과 같은
로컬 서버·진행도를 사용하며, 상단에서 연결할 Codex 세션을 선택합니다. 패널을
설치하는 것만으로 Codex 훅이 신뢰되거나 Orca 세션의 보상이 자동 생성되지는 않습니다.
`open -a Orca <주소>`는 사이드바를 여는 명령이 아닙니다.

빌드는 `codex/dist/orca/`에 manifest·worker·공유 HTML을 생성합니다. 이 폴더는
옆의 `cli.mjs`·`server.mjs`와 함께 유지해야 하며 단독으로 옮기면 안 됩니다.
Node 경로를 별도로 지정하려면 Orca 실행 환경에 `CAPPL_PALS_NODE`를 설정합니다.
다시 빌드하면 개발 플러그인이 갱신됩니다. 제거는
`orca plugin dev unload "$PWD/codex/dist/orca" --json`입니다.

### 빈 화면이 뜰 때

현재 빌드의 `node codex/dist/cli.mjs url` 주소로 다시 여세요. 첫 요청에는 서버가
읽을 수 있는 `?token=...`이 필요합니다. 예전 실행기의 `#token=...` 주소는 첫
요청에서 HTTP 403을 만들었습니다. 페이지가 열린 뒤에는 주소의 토큰을 fragment로
옮깁니다. 접속 토큰은 공유하거나 PR·스크린샷에 넣지 마세요.

## Codex와 연결하는 방식

- `UserPromptSubmit`: 하루 첫 보상, 휴식, 듣기·생각하기.
- `PreModelRequest`: 생각하는 표정.
- `PreToolUse` / `PostToolUse`: 읽기·편집·실행·테스트 표정과 검증된 결과 보상.
- `PermissionRequest`: 권한 대기 표정. 승인/거부 결정은 반환하지 않습니다.
- `Stop` / `Interrupt`: 춤 또는 대기 상태 복귀.
- 패치 도구는 편집으로, 셸 도구는 Bash 결과로 변환합니다. `write_stdin`으로 끝나는
  긴 명령은 중간 출력들을 모아 최종 종료 결과에서 한 번만 보상합니다.
- 테스트·검사·커밋·PR 생성·병합은 원본 판정식을 사용합니다. 도구 호출 자체에는
  보상이 없습니다. 계획 승인은 창의 **계획 승인 / Approve plan** 버튼으로
  직접 기록합니다. 원본처럼 편집 전일 때만 계획 보상을 받으며, `update_plan`
  완료 자체를 사용자 승인으로 간주하지 않습니다.

## 화면과 검증의 한계

Codex에 Claude의 `$.ui` 창·스피너·키보드 포커스를 주입하지 않습니다. 공개 API에서
동일한 확장 지점을 확인하지 못해, 화면은 127.0.0.1의 브라우저 동반 창 또는
Orca의 별도 플러그인 패널로 제공합니다.
`/cappl` 등 Claude의 고유 슬래시 명령 대신 창 버튼·CLI·Codex 스킬을 사용합니다.
따라서 게임 규칙을 재사용하는 이식이며 화면 통합 방식까지 동일한 버전은 아닙니다.
Codex에는 원본의 계획 승인 이벤트와 동일한 이벤트가 없어 동반 창의 명시적인 승인 버튼으로 대응합니다.
음원은 원본 재생 코드를 사용하며 플랫폼의 사운드 재생기가 있어야 들립니다.

자동 테스트는 원본 규칙·그림·애니메이션 테스트와 Node 동반 서버의 HTTP 통합 테스트를
실행합니다. 인증된 첫 페이지 로드와 Orca worker의 로컬 서버 연결도 통합 검증합니다.
실제 Codex 훅 전달, 브라우저·Orca 화면 및 스피커 재생은 별도 수동 검증 대상입니다.

## 저장과 실행 구조

기본 데이터: `${CODEX_HOME:-~/.codex}/cappl-pals/`. `store.json`에 공유 진행도와
세션별 편집·검증 상태, 이벤트 중복 영수증, 진행 중인 긴 명령을 보관합니다.
`endpoint.json`은 로컬 접속 토큰, `daemon.log`는 오류 기록입니다.
`CAPPL_PALS_DATA`로 테스트 데이터 폴더를 별도로 지정할 수 있습니다.
기존 Claude 진행도 파일은 읽거나 변경하지 않습니다.

서버는 루프백에만 바인딩하고 임의 포트를 사용하며 모든 요청에 로컬 토큰을 요구합니다.
동작 요청은 한 서버에서 직렬 처리하고 저장 파일은 임시 파일 후 rename으로 교체합니다.
프로세스 재시작 후에도 편집→실패→수정→성공 상태를 복원합니다.
Claude 엔진 어댑터는 `src/runtime.ts`, 이벤트와 화면 호환 계층은 `src/engine.ts`,
훅 변환은 `src/events.ts`·`src/server.ts`에 있습니다. `build.ts`가 원본을 번들링하며
게임 로직을 별도로 복제하지 않습니다.

참고: [OpenAI 플러그인 패키징](https://developers.openai.com/plugins/build/plugins),
[Codex 훅](https://learn.chatgpt.com/docs/hooks).
