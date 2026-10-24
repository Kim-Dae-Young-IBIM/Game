# 세팅 방법 (PC 없이, 폰으로)

서버는 **Render**(무료 클라우드)에서 돌아간다. 집에는 TV와 폰만 있으면 된다.
아래 순서는 폰 브라우저로 그대로 따라 할 수 있다.

## 처음 한 번만

### 1. 최신 코드를 main에 병합
GitHub 앱(또는 github.com)에서 저장소 **Kim-Dae-Young-IBIM/Game** → **Pull requests**에서 열린 PR을 **Merge**한다.
Render는 `main` 브랜치에 있는 `render.yaml` 설정을 읽으므로, 병합이 먼저다.

### 2. Render에 배포
1. 폰 브라우저로 이 주소를 연다:
   **https://render.com/deploy?repo=https://github.com/Kim-Dae-Young-IBIM/Game**
2. **GitHub로 가입/로그인**한다(GitHub 계정 연결을 허용).
3. "Blueprint" 화면이 나오면 이름(아무거나, 예: `band`)을 넣고 **Apply / Deploy Blueprint**를 누른다.
   - 서비스 이름 `shaky-animal-band`, 요금제 **Free**, 지역 **Singapore**로 자동 설정된다.
   - 결제 수단을 요구하는 화면이 나오면 진행하지 말고 알려 주기(무료 요금제는 보통 필요 없음).
4. 3~5분 기다리면 서비스 화면 위쪽에 주소가 나온다. 예: `https://shaky-animal-band.onrender.com`
   (이름이 이미 쓰였으면 뒤에 글자가 붙는다. **화면에 나온 주소**를 쓴다.)
5. 그 주소 뒤에 `/healthz`를 붙여 열었을 때 `ok`가 나오면 성공.

### 3. TV 즐겨찾기
1. TV 리모컨 홈 → **웹 브라우저** 앱.
2. `https://<내 주소>/tv/` 입력 → 무대·QR·4자리 코드가 보이면 성공.
3. 브라우저 메뉴에서 **즐겨찾기 추가**(또는 홈 화면에 고정).
   - 처음 테스트할 때는 `https://<내 주소>/tv/?debug`로 진단 화면을 켜 두는 것을 권장.

## 놀 때마다

1. TV에서 즐겨찾기를 연다.
   - 15분 넘게 아무도 안 썼으면 서버가 잠들어 있어 **약 1분** 흰 화면/로딩이 보인다. 기다리면 열린다.
2. 리모컨 **OK** → "둥" 소리.
3. 폰 카메라로 TV의 QR을 찍어 연다 → ▶ 누르기.
   - iPhone: **"동작 및 방향 접근" → 허용**
   - QR이 안 되면 폰 브라우저에 `https://<내 주소>/p` 입력 후 TV의 4자리 코드.
4. 흔들기!

노는 동안(폰이 연결돼 있는 동안)은 서버가 잠들지 않는다.

## 문제가 생기면

1. TV를 `?debug`로 열어 진단 화면을 본다(읽는 법: `docs/test-checklist.md` 맨 앞 표).
2. Render 대시보드(폰으로 dashboard.render.com) → `shaky-animal-band` → **Logs**
   - `[tv 1234] report: …`, `[phone 1234] error: …` 줄이 보인다.
   - 문제가 난 시각 전후 줄을 복사해 보내 주면 원인을 찾을 수 있다.
3. Render가 가끔 서버를 재시작하면 방 코드가 바뀔 수 있다 → TV 새로고침, 폰은 QR 다시 찍기.

## 업데이트

GitHub에서 PR을 **Merge**하면 Render가 자동으로 다시 배포한다(3~5분). 따로 할 일 없음.
배포 중에는 TV를 새로고침하지 말고 끝난 뒤(대시보드에 **Live** 표시) 새로고침한다.

## 알아 둘 것

- 주소는 인터넷에 공개돼 있지만, 방 코드를 알아야 들어올 수 있다. 같은 곳에서 틀린 코드를 30번 넣으면 10분간 막힌다.
- 무료 요금제 한도(월 750시간)는 서비스 하나를 계속 켜 둬도 넘지 않는다.
- PC가 생기면 PC에서 직접 돌릴 수도 있다: `npm ci && npm run build && npm start` + `npm run tunnel`(ngrok). 개발할 때만 필요.
