---
paths:
  - "**/*.js"
  - "**/*.mjs"
  - "**/*.html"
  - "**/*.css"
---

# JS/HTML 코드 규칙

이 파일은 `.js`, `.mjs`, `.html`, `.css` 파일을 다룰 때만 로드된다.

- 모듈은 ES Modules(`import`/`export`)만 쓴다. 서버도 `"type": "module"`.
- `tv/`: Chromium 79(webOS 6.5) 기준. 문법은 빌드(vite `build.target: chrome79`)가 낮춰 주지만, Web API는 낮춰 주지 않으므로 79에 없는 API(예: `structuredClone`, `Array.prototype.at`, `AbortSignal.timeout`)는 쓰지 않는다.
- `tv/` CSS도 79 기준: flex/grid `gap`(flex는 84+), `inset`(87+), `aspect-ratio`(88+), `:is()`/`:where()`(88+)는 쓰지 않는다. CSS는 빌드가 낮춰 주지 않는다.
- `phone/`: 프레임워크 없이 순수 HTML/JS. 센서·Wake Lock·진동·전체화면은 항상 존재 여부를 확인한 뒤 호출하고, 없으면 조용히 건너뛴다.
- 흔들림·박자·방 코드처럼 판정이 들어가는 로직은 DOM 없이 `shared/` 또는 `server/`의 순수 함수로 두고 `tests/`에 `node --test` 단위 테스트를 붙인다.
- 소켓 이벤트 이름은 `shared/protocol.js` 상수만 쓴다. 문자열을 직접 쓰지 않는다.
- 아이에게 보이는 화면에 글자를 넣지 않는다. 부모용 입력(방 코드)만 예외.

harness-log에 같은 실수가 두 번 기록되면 여기에 한 줄 추가한다.
