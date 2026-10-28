# Homepage Avatar

내 포트폴리오 사이트(https://my-homepage-jh-f22e.vercel.app)를 3D 아바타가 직접 넘기며 소개하고,
인터뷰어 질문과 방문자의 직접 질문(글자·음성)에 답하는 Electron 데스크톱 앱입니다.

- 기획 과정: [지도 이슈](https://github.com/happytuco-arch/homepage-avatar/issues/1) · [docs/00-사용장면.md](docs/00-사용장면.md) · [docs/01-설계서.md](docs/01-설계서.md)
- 사람이 읽는 사용법: [docs/사용가이드.md](docs/사용가이드.md)

## 실행 환경

| 항목 | 값 |
|---|---|
| OS | Windows 10/11, macOS 12 이상 |
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
| `ELEVENLABS_API_KEY` | 아바타·인터뷰어 목소리(글자 단위 입 모양), 음성 질문 인식 | 컴퓨터 내장 음성, 마이크 버튼 숨김 |
| `VOICE_AVATAR`, `VOICE_INTERVIEWER` | ElevenLabs 목소리 ID | 기본 목소리 |
| `SUPABASE_URL`, `SUPABASE_KEY` | 사이트 자료 실시간 읽기(공개 publishable 키) | `assets/site-snapshot.json` |
| `CLAUDE_SCRIPT_MODEL`, `CLAUDE_ANSWER_MODEL` | 모델 바꾸기 | `claude-sonnet-5-5`, `claude-haiku-5-5` |

키는 메인 프로세스에서만 읽습니다. 화면(렌더러)에는 키가 넘어가지 않고, 사이트 화면에는 아무 권한도 열지 않습니다.

## 구조

```
src/main/      main.js(창 두 겹·IPC) · config · siteData(Supabase) · llm(Claude) · voice(ElevenLabs) · site(사이트 조작) · lipsync · template
src/renderer/  overlay.html/css/js(자막·조작·투어 진행) · avatar3d.js(3D 아바타)
assets/        site-snapshot.json(오프라인 자료) · avatar.vrm(선택: 넣으면 VRM 아바타 사용)
scripts/       snapshot.js — 사이트 자료 스냅숏 갱신 (npm run snapshot)
tests/         core.test.cjs — npm test
```

- 대본과 음성은 사용자 데이터 폴더의 `audio-cache/`에 저장합니다. 같은 사이트 자료·같은 대사는 다시 생성하지 않습니다(크레딧 절약).
- my-homepage 코드는 수정하지 않습니다. 실행 중인 페이지에 손 모양 커서와 강조 테두리를 덧붙여 그릴 뿐입니다.

## 테스트

```bash
npm test
```

## 개발용 환경변수

- `AVATAR_DEVTOOLS=1` — 아바타 띠의 개발자 도구 열기
- `AVATAR_SHOT=<폴더>` — 5초마다 화면 두 겹을 PNG로 저장
- `AVATAR_LOG=<파일>` — 아바타 띠의 콘솔 출력을 파일로 저장
