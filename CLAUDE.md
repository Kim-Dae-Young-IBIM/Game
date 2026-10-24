# CLAUDE.md

이 파일은 매 세션 자동으로 읽힌다. 200줄 이내로 유지하고, 길어지면 `.claude/rules/`나 `.claude/skills/`로 옮긴다.

이 저장소는 한 가지 작업에 묶이지 않는다. 개발, 문서, 분석, 데이터 정리 등 어떤 작업이든 할 수 있다. 작업 종류별 규칙은 `.claude/rules/`에 파일 경로 단위로 두며, 해당 파일을 다룰 때만 적용된다.

## 1. 저장소 개요
- **흔들흔들 동물 밴드**: 5살·2살 아이가 폰을 흔들면 TV 속 동물이 악기를 연주하는 가족 합주 웹 게임. 앱 설치 없이 웹으로만 동작.
- TV: LG 75QNED90(webOS 6.5 내장 브라우저, Chromium 79 수준) → 무대·소리 재생.
- 컨트롤러: Galaxy S26(Chrome/삼성 인터넷), iPhone 16 Pro(Safari). TV 화면의 QR 또는 4자리 방 코드로 접속.
- 구조: Node.js + Socket.IO 서버가 방 코드로 TV 1대 + 폰 N대를 묶는다. TV는 Phaser 3 + Howler.js, 폰은 순수 HTML/JS(DeviceMotionEvent).
- 현재 단계: 1단계 MVP(고양이 드러머 1마리).
- **기술 결정(위 스택, 방 구조, HTTPS 방식)을 바꾸려면 먼저 사용자에게 묻는다.**

## 2. 자주 쓰는 명령
- `npm ci`: 의존성 설치(lock 파일 그대로). 새 패키지 추가는 승인 필요(5장).
- `npm run dev`: 개발 서버. vite(3000, 화면) + 소켓 서버(3001, vite가 `/socket.io` 프록시). TV `http://localhost:3000/tv/`, 폰 `/phone/`.
- `npm run build`: `dist/` 생성(TV·폰 JS를 Chromium 79 문법으로 낮춤).
- `npm start`: `dist/`를 서빙하는 실서버(3000). `/` → TV, `/p` → 폰.
- `npm test`: 단위·통합 테스트(`node --test`). 빌드 후 실행하면 `dist` 문법 호환 검사도 한다.
- `npm run tunnel`: `ngrok http 3000`(HTTPS 주소 발급, 센서 권한에 필요). ngrok은 별도 설치.
- `npm run sounds`: `assets/sounds/*.wav` 합성음 다시 생성.
- 완료 검증: `npm run build && npm test`(Stop 훅이 자동 실행).

## 3. 폴더 구조
- `server/`: `index.js` HTTP 정적 서빙 + Socket.IO 중계, `rooms.js` 방 코드 관리(순수 로직).
- `tv/`: TV 페이지. `main.js` Phaser 무대, Howler 소리, 박자 시계, QR.
- `phone/`: 폰 컨트롤러 페이지. 코드 입력, 센서 권한, 흔들림 → 전송, 화면 보호.
- `shared/`: 서버·TV·폰 공용 순수 로직. `shake.js` 흔들림 판정, `beat.js` 박자 보정, `protocol.js` 이벤트 이름.
- `assets/`: 정적 자원(빌드 시 루트로 복사). `animals/*.svg`, `sounds/*.wav`(합성음, 라이선스 문제 없음).
- `scripts/`: `dev.mjs` 개발 서버 동시 실행, `gen-sounds.mjs` 효과음 합성.
- `tests/`: `node --test` 테스트. `docs/`: 실기기 체크리스트, 하네스 기록.

## 4. 공통 작업 규칙
- 작업 종류에 관계없이 지킬 규칙만 여기에 둔다. 종류별 규칙은 `.claude/rules/`에 둔다.
- **아이 대상 UI**: 글자 없이 그림·소리로만 안내. 버튼 최소 크기 120px. (부모가 입력하는 방 코드 숫자만 예외)
- **2살 입력은 '흔들기'만**. 틀리는 경우가 없어야 한다(실패 상태·오답 화면 없음).
- **iOS 센서 권한**: 시작 버튼 탭 핸들러 안에서 `DeviceMotionEvent.requestPermission()`을 await 전에 먼저 호출. (최신 Chromium에도 이 함수가 있어 "granted"가 아닐 수 있으므로 devicemotion은 항상 듣고, 값이 안 오면 탭으로 대체)
- **서버 입력은 믿지 않는다**: 소켓·HTTP 핸들러는 외부 입력 파싱을 try 안에서 하고, 예외가 핸들러 밖으로 새지 않게 한다(새면 서버가 죽는다).
- **흔들림 판정**: 가속도(중력 포함) 크기 약 12m/s² 초과 = 1회, 150ms 디바운스, 세기 → 볼륨(0.3~1.0). 세기는 넘은 순간이 아니라 정점 기준(최대 80ms 대기). 구현은 `shared/shake.js`.
- **박자 보정**: 소리는 가장 가까운 박자에 맞춰 재생. 같은 박자에 온 흔들림은 가장 센 것 하나로 묶는다(`shared/beat.js`, 기본 BPM 100).
- **폰 화면**: 전체화면(지원 기기만), Wake Lock, 확대·뒤로가기 방지, 진동은 지원 기기만(iPhone 없음).
- TV 코드는 Chromium 79에서 돌아야 한다. 세부 규칙은 `.claude/rules/code-style.md`.

## 5. 금지 사항
- 반드시 막아야 하는 것은 `.claude/harness.json`의 `forbidden`에 등록한다. 이 문서의 지시는 요청일 뿐 보장이 아니다.
- **인증서·.env 커밋 금지**: `.gitignore`(`.env`, `.env.*`, `.envrc`, `ngrok.yml`, `*.pem`, `*.key`, `*.crt` 등), `forbidden`(개인키, ngrok authtoken·API 키 내용 패턴), `settings.json` deny(`git add -f` 변형).
- **`.claude/hooks/` 수정 금지**: `settings.json` deny(`Edit/Write(./.claude/hooks/**)`).
- **승인 없는 새 의존성 추가 금지**: `settings.json` ask(`npm install <패키지>` 등). 설치는 `npm ci` 또는 인자 없는 `npm install`만.
- 훅의 `forbidden`은 파일 내용만 검사하므로, 경로·명령 단위 금지는 `settings.json` 권한 규칙으로 강제한다. 권한 규칙은 명령 문자열 매칭이라 우회(예: Bash `sed -i`)가 가능한 **최선의 노력 수준**이다. 우회하지 않는다.

## 6. 완료 판정 기준
- 작업마다 사용자가 정한 완료 기준을 따른다.
- 결과물은 끝내기 전에 직접 열거나 실행해 확인한다.
- 자동 검증이 필요하면 `.claude/harness.json`의 `verify`에 등록한다(현재 `npm run build && npm test`).
- **1단계 완료 기준**
  - `npm run build && npm test` 통과
  - 흔들림 판정 로직 단위 테스트(가짜 가속도 데이터) — `tests/shake.test.js`
  - 데스크톱 브라우저 2창으로 TV/폰 시뮬레이션 동작 확인
  - 실기기 테스트 체크리스트 `docs/test-checklist.md` 작성
  - 사용자가 실기기에서 확인할 순서를 마지막에 짧게 안내

## 7. 참고 위치
- 하네스 실패 기록: `docs/harness-log.md` · 점검: `/harness-review`
- 리뷰 서브에이전트: `.claude/agents/reviewer.md`
- 실기기 테스트: `docs/test-checklist.md`
- 외부 자료: Phaser 3 https://newdocs.phaser.io · Howler https://howlerjs.com · Socket.IO https://socket.io/docs/v4 · DeviceMotionEvent https://developer.mozilla.org/docs/Web/API/DeviceMotionEvent
