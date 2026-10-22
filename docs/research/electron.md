# Electron 구조 조사: 사이트 위 투명 아바타 층과 사이트 조작

질문(#3): (1) 외부 사이트 위에 투명 아바타·자막 층 겹치기와 Windows·Mac 차이, (2) 메인 프로세스에서 사이트 클릭·스크롤·요소 위치 읽기, (3) 렌더러에 ElevenLabs 키를 노출하지 않는 IPC 구조, (4) 설치 파일 도구와 서명 없는 배포의 제약.

조사일: 2026-10-22. 출처는 electronjs.org 공식 문서다. 문서로 직접 확인하지 못한 항목은 **[미확인]** 으로 표시했다.

## 결론 요약

- **겹치기: 창 하나 + `WebContentsView` 두 겹을 권장한다.** 아래는 사이트, 위는 투명 배경의 아바타 층이다. iframe 방식은 쓸 수 없다고 본다. 사이트 코드를 고칠 수 없고, 사이트가 프레임 삽입을 막는 헤더를 보내면 막힐 수 있으며, 다른 출처(cross-origin)라 DOM 조작도 안 된다.
- **사이트 조작: 메인에서 `webContents.executeJavaScript()`(또는 격리 월드용 `executeJavaScriptInIsolatedWorld`)로 DOM을 조작하고 요소 좌표를 읽는다.** "진짜 입력"이 필요할 때만 `sendInputEvent`를 쓴다. 이 함수는 창에 포커스가 있어야 동작한다.
- **키 보호: ElevenLabs 호출은 메인에서만 한다.** 렌더러에는 `contextIsolation` + `contextBridge`로 "말해줘(텍스트)" 같은 좁은 함수 하나만 열고, 메인이 받아 온 오디오 바이트만 돌려준다.
- **배포: electron-builder 하나로 Windows NSIS와 macOS dmg를 만든다.** 서명 없이 배포하면 Windows는 SmartScreen 경고가 뜨고, Mac은 Gatekeeper가 막는다("손상됨" 경고). 사용자가 수동으로 우회해야 하므로 설치 안내문이 필요하다.

## 1. 투명 층 겹치기

### 권장안: BaseWindow/BrowserWindow + WebContentsView 2겹

- `win.contentView.addChildView(view[, index])`로 자식 뷰를 붙인다. index를 생략하면 목록 끝에 붙고, 이미 있는 뷰를 다시 붙이면 "가장 위(topmost)"로 올라간다. 그러므로 나중에 붙인 뷰가 위에 그려진다. — [View](https://www.electronjs.org/docs/latest/api/view)
- 아바타 뷰는 `view.setBackgroundColor('#00000000')`(ARGB 순서, 알파가 앞)로 투명하게 만든다. 문서에 RGBA·HSLA 반투명 예시가 있다. — [View](https://www.electronjs.org/docs/latest/api/view)
- `WebContents` 하나는 한 번에 `WebContentsView` 하나에만 표시할 수 있다. 뷰는 앱의 `ready` 이후에 만든다. — [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- 두 뷰의 크기(bounds)를 창 크기에 맞춰 똑같이 잡고, 창 크기가 바뀔 때마다 다시 맞춘다.

**클릭 통과 문제(핵심 위험):** 위 뷰가 전체를 덮으면 사용자의 클릭이 사이트에 닿지 않는다. 대안은 다음과 같다.
1. 아바타 뷰를 화면 전체가 아니라 아바타·자막이 차지하는 영역으로만 잡는다(가장 단순).
2. 투명한 **별도 창**(`transparent: true`, 부모 창의 child)을 두고 `win.setIgnoreMouseEvents(true, { forward: true })`를 쓴다. `forward` 옵션은 macOS·Windows만 지원하며, Windows에서는 작업 관리자처럼 관리자 권한 창이 포커스를 가지면 잠시 동작하지 않는다(UIPI). macOS에서는 투명 창이 잔상을 남길 수 있어 `invalidateShadow()`가 마련되어 있다. — [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
   단점: 창 두 개의 위치를 맞춰야 하고, 최소화·이동 동기화가 번거롭다.
3. 강조 테두리처럼 사이트 위에 꼭 겹쳐야 하는 그림은 아바타 층이 아니라 **사이트 뷰 안에 executeJavaScript로 오버레이 DOM을 주입**해서 그린다. 그러면 사이트 스크롤과도 자연스럽게 맞는다(사이트 원본 코드는 바뀌지 않는다).

정리하면, 아바타·자막은 1번(작은 위 뷰)으로, 강조는 3번(사이트 안 주입)으로 그리는 조합이 Windows·Mac 차이가 가장 적다. 2번은 forward 옵션이 플랫폼마다 다르게 동작하므로 마지막 수단으로 남긴다.

**[미확인]** WebContentsView 투명 배경 위로 WebGL(3D 아바타)을 그릴 때의 플랫폼별 합성 품질은 문서에 나오지 않는다. 프로토타입으로 확인해야 한다.

## 2. 메인 프로세스에서 사이트 조작

- `webContents.executeJavaScript(code[, userGesture])` → `Promise<any>`. 페이지 로딩이 끝날 때까지 기다렸다가 실행한다. `userGesture: true`로 사용자 동작 요구 제한(예: 전체 화면)을 풀 수 있다. — [webContents](https://www.electronjs.org/docs/latest/api/web-contents)
  - 쓰임새: `document.querySelector(...).click()`, `el.scrollIntoView({behavior:'smooth'})`, `el.getBoundingClientRect()`로 요소 좌표 읽기(결과는 직렬화 가능한 값으로 반환).
- `executeJavaScriptInIsolatedWorld(worldId, scripts[, userGesture])`: worldId 0은 기본 월드, 999는 contextIsolation용 월드이고, 그 밖의 정수를 써도 된다. 사이트 스크립트와 전역 변수가 섞이지 않게 하려면 별도 월드(예: 1000)를 쓴다. 단, DOM은 공유된다. — 같은 문서
- `sendInputEvent(mouse | wheel | keyboard)`: 진짜 마우스·휠·키 입력을 흉내 낸다. 담고 있는 창에 **포커스가 있어야** 동작한다. — 같은 문서
  - JS의 `click()`이 통하지 않는 경우(예: 신뢰된 이벤트만 받는 UI)에만 쓴다. 좌표는 위의 getBoundingClientRect로 구한다.
- 사이트 쪽 preload는 이번 목적에는 필요 없다. 메인에서 실행하는 executeJavaScript로 충분하다. 사이트 뷰에는 `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`를 그대로 둔다.
- 이 사이트는 라우터 없이 `view` 상태로 화면을 바꾸는 SPA이므로, 메뉴 클릭 뒤에 요소가 나타날 때까지 기다리는(폴링 또는 MutationObserver) 코드를 함께 주입해야 한다.

## 3. 키를 노출하지 않는 IPC 구조

```
[아바타 렌더러] --window.avatar.speak(text)--> preload(contextBridge)
   --ipcRenderer.invoke('tts', text)--> [메인] ipcMain.handle('tts')
   --fetch ElevenLabs (키는 메인 메모리에만)--> 오디오 ArrayBuffer 반환
```

- 원칙(공식 보안 체크리스트): 원격 콘텐츠에 Node 통합 금지, contextIsolation·sandbox 사용, IPC 메시지의 보낸 쪽(`event.senderFrame`) 검증, `ipcRenderer` 전체를 노출하지 말고 좁은 함수만 노출. — [Security](https://www.electronjs.org/docs/latest/tutorial/security), [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- 외부 사이트 뷰에는 preload를 아예 붙이지 않는다. 그러면 사이트(또는 사이트에 섞인 제3자 스크립트)가 TTS 창구에 접근할 수 없다.
- 키 보관: 설치본에 키를 넣으면 asar를 풀어 꺼낼 수 있다(asar는 암호화가 아니다). 사용자가 처음 실행할 때 직접 입력하게 하고 `safeStorage`로 암호화해 저장하거나, 중계 서버를 두는 방안을 검토한다. — [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) **[미확인: 어느 쪽을 쓸지는 결정 사항]**

## 4. 설치 파일 도구와 서명 없는 배포

| | electron-builder | Electron Forge |
|---|---|---|
| 성격 | 설정 파일 하나로 패키징과 설치 파일 생성 | 공식 도구 묶음(템플릿·플러그인·maker) |
| Windows | NSIS 설치 파일 | Squirrel.Windows, WiX(MSI) 등 |
| Mac | dmg, zip | dmg, zip |
| 교차 빌드 | Mac용 빌드는 사실상 macOS가 필요함 | 같음 |

- 공식 배포 문서는 Forge를 권장 도구로 소개한다. — [Distribution overview](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)
- 둘 다 쓸 수 있으며, NSIS 한 파일로 끝나는 electron-builder가 이 과제 규모에는 더 단순하다. Mac dmg는 macOS에서 빌드하거나 GitHub Actions의 macOS 러너를 쓴다.
- **서명 없는 배포의 제약** — [Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
  - 공식 문서는 Windows와 macOS 모두 서명 없는 앱 실행을 막는다고 밝힌다. 2023년 6월부터는 예전의 non-EV 인증서도 "완전히 서명 없는 앱"으로 취급되어 같은 경고가 뜬다.
  - Windows: SmartScreen의 "Windows의 PC 보호" 창이 뜨고, "추가 정보 → 실행"을 눌러야 한다.
  - macOS: Gatekeeper가 막고 "앱이 손상되었습니다" 같은 경고가 뜬다. 사용자가 여러 단계의 수동 조작을 해야 한다(시스템 설정의 "확인 없이 열기", 또는 `xattr -cr /Applications/앱.app`).
  - **[미확인]** Apple Silicon은 서명이 전혀 없는 arm64 바이너리를 실행하지 않는다. electron-builder는 인증서가 없으면 ad-hoc 서명을 하는 것으로 알려져 있으나, 이번 조사에서 해당 문서 페이지(electron.build)를 열지 못해 확인하지 못했다.
  - 자동 업데이트(macOS)는 서명이 필요하므로 이번 범위에서는 빼는 편이 안전하다.

## 남은 확인 거리(프로토타입 대상)

1. 투명 WebContentsView 위 three.js/VRM 렌더링의 Windows·Mac 품질과 프레임
2. 대상 사이트가 메뉴 클릭 뒤 새 섹션을 그리는 시점(대기 로직)
3. 서명 없는 Mac 빌드를 다른 Mac에서 실제로 여는 절차
