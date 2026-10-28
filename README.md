# Homepage Avatar

내 포트폴리오 사이트(https://my-homepage-jh-f22e.vercel.app)를 3D 아바타가 직접 넘기며 소개하고,
인터뷰어 질문과 방문자의 직접 질문(글자·음성)에 답하는 Electron 데스크톱 앱입니다.

- 기획 과정: [지도 이슈](https://github.com/happytuco-arch/homepage-avatar/issues/1) · [docs/00-사용장면.md](docs/00-사용장면.md) · [docs/01-설계서.md](docs/01-설계서.md)
- 사람이 읽는 사용법: [docs/사용가이드.md](docs/사용가이드.md) · 대본 전체: [docs/대본.md](docs/대본.md)
- 실행 파일 받기: [Releases](https://github.com/happytuco-arch/homepage-avatar/releases)

## 실행 환경

| 항목 | 값 |
|---|---|
| OS | Windows 10/11 (x64), macOS 12 이상 (Apple Silicon. Intel Mac 은 소스에서 `npm start`) |
| 런타임 | Node.js 20 이상 (소스에서 실행할 때만) |
| 주요 의존성 | electron 45, three 0.186, @pixiv/three-vrm 3, dotenv |
| 빌드 | electron-builder 26 (Windows zip / macOS zip, 서명 없음) |
| 외부 API (선택) | Anthropic Claude Messages API, ElevenLabs TTS(with-timestamps)·Speech-to-Text, Supabase REST(공개 읽기) |

## 설치와 실행

```bash
git clone https://github.com/happytuco-arch/homepage-avatar.git
cd homepage-avatar
npm install
cp .env.example .env      # 키를 채웁니다(비워 두어도 실행됨)
npm start
```

실행 파일 만들기:

```bash
npm run dist              # 현재 OS용 zip → dist/
```

Windows와 Mac 실행 파일은 GitHub Actions(`.github/workflows/build.yml`)에서도 만들 수 있습니다.
Actions 탭에서 build → Run workflow를 누르면 결과물(zip)을 내려받을 수 있습니다.

## 환경변수 (`.env`)

`.env`는 깃과 제출 zip에 넣지 않습니다. 앱은 아래 순서로 `.env`를 찾습니다:
작업 폴더 → 실행 파일 옆 → 사용자 데이터 폴더(Windows `%APPDATA%\homepage-avatar`, Mac `~/Library/Application Support/homepage-avatar`).

| 변수 | 쓰임 | 비웠을 때 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 사이트 자료를 대화체로 각색한 대본, 직접 질문 답변 | 기본 대본 + 질문 목록 매칭 |
| `ELEVENLABS_API_KEY` | 직접 질문에 대한 답을 ElevenLabs 목소리로, 말로 한 질문 인식 | 대본은 동봉 음성으로, 질문 답만 내장 음성. 마이크 버튼 숨김 |
| `VOICE_AVATAR`, `VOICE_INTERVIEWER` | ElevenLabs 목소리 ID | Brian · Jessica (동봉 음성과 같은 목소리) |
| `SUPABASE_URL`, `SUPABASE_KEY` | 사이트 자료 실시간 읽기(공개 publishable 키) | `assets/site-snapshot.json` |
| `CLAUDE_SCRIPT_MODEL`, `CLAUDE_ANSWER_MODEL` | 모델 바꾸기 | `claude-sonnet-5-5`, `claude-haiku-5-5` |

키는 메인 프로세스에서만 읽습니다. 화면(렌더러)에는 키가 넘어가지 않고, 사이트 화면에는 아무 권한도 열지 않습니다.

## 구조

```
src/main/      main.js(창 세 겹·IPC) · stage.js(아바타 층을 화면 위로 걷게 함) · site.js(사이트 조작: 메뉴·강조·글 열기·영상)
               config · siteData(Supabase) · llm(Claude) · voice(ElevenLabs) · lipsync · template · record(개발용 녹화)
src/renderer/  overlay.*(자막·조작·투어 진행) · avatar.html / avatar-view.js / avatar3d.js(3D 아바타)
assets/        site-snapshot.json(오프라인 자료) · default-script.json(각색 대본 + 질문 목록) · avatar.vrm(선택)
scripts/       snapshot.js(npm run snapshot) · bake-script.js(npm run bake) · script-md.js(npm run script:md / script:apply)
tests/         core.test.cjs — npm test
```

- 창은 세 겹입니다. 아래는 실제 사이트, 그 위에 자막·버튼 띠, 맨 위에 작은 투명 아바타 층이 사이트 위를 옮겨 다닙니다.
- 대본(`assets/default-script.json`)은 사이트 자료를 Claude가 대화체로 각색한 것을 사람이 다듬은 것입니다. 사이트 자료가 같으면 실행할 때 Claude를 부르지 않습니다.
  - 대본 고치기: `npm run script:md` → `docs/대본.md` 수정 → `npm run script:apply`
  - 새로 만들기: `npm run bake` (손으로 고친 내용은 덮어씀)
- 음성은 사용자 데이터 폴더의 `audio-cache/`에 저장합니다. 같은 목소리·같은 대사는 다시 생성하지 않습니다(크레딧 절약).
- my-homepage 코드는 수정하지 않습니다. 실행 중인 페이지에 커서·강조 테두리를 덧붙이고, 글을 읽는 동안만 스크롤 스냅을 잠시 끕니다.

## 음성 출처

대본 음성(`assets/voice/`)은 [ElevenLabs](https://elevenlabs.io)(elevenlabs.io) 무료 요금제의 기본 목소리 Brian(아바타)·Jessica(인터뷰어)로 만들었습니다.
수업 과제용 비상업 배포이며, 무료 요금제 조건에 따라 출처를 표기합니다. 대본을 바꾸면 `npm run bake:voice`로 바뀐 대사만 다시 만듭니다.

## 테스트

```bash
npm test
```

## 개발용 환경변수

- `AVATAR_DEVTOOLS=1` — 아바타 띠의 개발자 도구 열기
- `AVATAR_SHOT=<폴더>` — 5초마다 화면 두 겹을 PNG로 저장
- `AVATAR_LOG=<파일>` — 아바타 띠의 콘솔 출력을 파일로 저장
- `AVATAR_FROM=<장면 id>` — 그 장면부터 시작(intro · works · papers · assignments · about · outro)
- `AVATAR_SHOT_MS=<ms>` — 캡처 간격
- `AVATAR_ASK=<질문>` — 40초쯤 직접 질문을 넣어 끼어들기 확인
- `AVATAR_RECORD=<파일.mp4>` — 앱 창과 소리를 녹화(`AVATAR_RECORD_SECONDS`, `AVATAR_RECORD_DELAY`). 크레딧을 쓰지 않으려면 `ELEVENLABS_API_KEY=` 를 함께 줌
