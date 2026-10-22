# 내장 음성 조사: Windows·Mac 한국어 음성과 단어 이벤트

질문(#4): ElevenLabs를 못 쓸 때 OS 내장 음성으로 (1) 한국어 남성 음성 둘을 낼 수 있는지, (2) Electron 렌더러 `speechSynthesis`에 보이는지, (3) `boundary` 이벤트로 자막·입 모양을 맞출 수 있는지, (4) 메인 프로세스 대안은 무엇인지.

## 결론 요약

- **Windows 기본 한국어 음성은 여성 하나(Microsoft Heami)뿐**입니다. 남성 둘은 기본 설치로는 불가능합니다.
- **macOS는 기본 Yuna(여성) + 내려받기 가능한 다국어 음성(Eddy·Reed·Rocko·Grandpa 등 남성 포함)**이 있어 남성 둘이 가능하지만, 사용자가 시스템 설정에서 내려받아야 합니다.
- Electron(Chromium) `speechSynthesis`는 OS 음성을 그대로 노출합니다. Windows에서는 SAPI5 데스크톱 음성(Heami Desktop)만 보이고, 내레이터용 "자연 음성"은 보이지 않습니다.
- `boundary` 이벤트(`charIndex`)는 Windows·macOS 로컬 음성에서 단어 단위로 옵니다. 자막 강조는 가능, **입 모양은 단어 단위 근사**(음소/viseme 아님)입니다.
- 따라서 대체 경로 설계: 한 목소리만 있으면 **피치/속도(`pitch`, `rate`)로 아바타와 면접관을 구분**하고, 두 번째 음성이 있으면 그것을 씁니다. `boundary`가 안 오면 글자 수 기반 타이머로 대체.

## 1. 기본 설치된 한국어 음성

### Windows 10/11
- 한국어 언어 기능의 TTS 음성은 **Microsoft Heami(여성)** 하나입니다. 출처: Microsoft, "Appendix A: Supported languages and voices" — https://support.microsoft.com/windows/appendix-a-supported-languages-and-voices-4486e345-7730-53da-fcfe-55cc64300f01
- Windows 11 내레이터의 **자연 음성(Natural voices, 한국어 SunHi·InJoon 등)**은 내레이터 전용으로 추가 다운로드되며, 위 문서·내레이터 안내(https://support.microsoft.com/windows/complete-guide-to-narrator-e4397a0d-ef4f-b386-d8ae-c172f109bdb1)에 따라 SAPI 앱 음성 목록과는 별개입니다. Edge 브라우저의 "Online (Natural)" 음성은 Edge 전용 클라우드 음성이라 Electron에는 없습니다.
- **이 PC 실측(2026-10-22, Windows 11 26200)**: `System.Speech` → `Microsoft Heami Desktop (ko-KR)`, `Microsoft Zira Desktop (en-US)`. OneCore 토큰 → `MSTTS_V110_koKR_HeamiM`. 즉 한국어는 Heami 하나.

### macOS
- 기본 한국어 음성 **Yuna(여성)**, 시스템 설정 > 손쉬운 사용 > 읽기 및 말하기 > 시스템 음성 > 음성 관리에서 추가 음성 다운로드. 출처: Apple, "Change the voice your Mac uses to speak text" — https://support.apple.com/guide/mac-help/change-the-voice-your-mac-uses-to-speak-text-mchlp2290/mac
- macOS 13 이후 다국어 음성(Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley)이 한국어도 지원 → 남성(Eddy·Reed·Rocko·Grandpa) 2개 이상 가능. 단 기본 미설치이고 음질은 Yuna보다 기계적. (Apple 음성 목록은 버전마다 바뀌므로 대상 Mac에서 `say -v '?'`로 확인 필요 — 미검증 항목)

## 2. Electron 렌더러 `speechSynthesis`
- Web Speech API의 `getVoices()`는 플랫폼 음성을 돌려주며 처음엔 빈 배열일 수 있어 `voiceschanged`를 기다려야 합니다. 출처: MDN `SpeechSynthesis.getVoices()` — https://developer.mozilla.org/docs/Web/API/SpeechSynthesis/getVoices , 명세 https://webaudio.github.io/web-speech-api/
- Chromium은 Windows에서 SAPI5(`content/browser/speech/tts_win.cc`), macOS에서 AVSpeechSynthesizer/NSSpeechSynthesizer(`tts_mac.mm`)를 씁니다. 출처: Chromium 소스 https://source.chromium.org/chromium/chromium/src/+/main:content/browser/speech/
- 따라서 Windows Electron에서는 `Microsoft Heami - Korean (Korean)` 하나가 한국어로 보일 것으로 예상(로컬 음성, `localService: true`). Electron 자체에 별도 TTS API는 없음.

## 3. `boundary` 이벤트
- `SpeechSynthesisUtterance`의 `boundary` 이벤트는 단어/문장 경계에서 `charIndex`, `charLength`, `name`을 제공합니다. 출처: MDN https://developer.mozilla.org/docs/Web/API/SpeechSynthesisUtterance/boundary_event , https://developer.mozilla.org/docs/Web/API/SpeechSynthesisEvent
- Chromium `tts_win.cc`는 SAPI `SPEI_WORD_BOUNDARY`를 받아 word 이벤트로, `tts_mac.mm`은 `willSpeakRangeOfSpeechString`을 word 이벤트로 전달합니다 → 두 OS 로컬 음성에서 단어 경계 수신 가능.
- 한계: 단어 단위라 입 모양은 "단어 시작마다 입 열기 + 진폭 없이 시간 보간" 수준. 오디오 스트림을 받지 못하므로 음량 기반 립싱크 불가(SAPI viseme 이벤트는 Chromium이 전달하지 않음). 한국어 어절 분할이 띄어쓰기와 다를 수 있어 `charIndex`로 원문을 잘라 쓰는 방식 권장.

## 4. 메인 프로세스 대안
- **Windows**: PowerShell `System.Speech.Synthesis.SpeechSynthesizer` — `SpeakProgress`(단어 위치), `VisemeReached`(입 모양 번호) 이벤트, `SetOutputToWaveFile`로 WAV 생성 가능. 출처: https://learn.microsoft.com/dotnet/api/system.speech.synthesis.speechsynthesizer , VisemeReached: https://learn.microsoft.com/dotnet/api/system.speech.synthesis.speechsynthesizer.visemereached . 파일로 뽑아 렌더러에서 재생하면 음량 분석 립싱크도 가능.
- **macOS**: `say -v Yuna -o out.aiff "..."`로 파일 생성(단어 타이밍 없음). 출처: `man say`(macOS 기본). 단어 타이밍이 필요하면 렌더러 `speechSynthesis` 쪽이 간단.
- 권장: 1차는 렌더러 `speechSynthesis`(+boundary), 정밀 립싱크가 필요할 때만 Windows에서 System.Speech로 WAV+viseme.

## 남은 확인
- 실제 Electron 창에서 `getVoices()` 목록과 Heami의 `boundary` 수신 여부를 한 번 찍어볼 것(이 조사는 소스·문서 기반 추론 + PC 설치 목록 실측).
- 대상 Mac에서 다국어 남성 음성의 한국어 품질.
