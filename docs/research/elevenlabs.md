# ElevenLabs 조사: 타임스탬프·한국어 목소리·크레딧

조사일: 2026-10-22 · 이슈 #2 · 출처는 모두 elevenlabs.io 공식 문서/요금/약관/도움말

## 1. 글자 단위 타임스탬프 API

- 엔드포인트: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps`
  ([API 문서](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps))
- 요청: 본문 `text`, `model_id`(기본 `eleven_multilingual_v2`), 쿼리 `output_format`(기본 `mp3_44100_128`).
- 응답(JSON):
  ```json
  {
    "audio_base64": "...",
    "alignment": {
      "characters": ["안", "녕", ...],
      "character_start_times_seconds": [0.0, 0.12, ...],
      "character_end_times_seconds": [0.12, 0.25, ...]
    },
    "normalized_alignment": { "같은 세 배열, 정규화된 텍스트 기준": "" }
  }
  ```
  세 배열 길이는 같다. 오디오는 base64라 디코드해 mp3 파일로 쓰고, `alignment`는 같은 이름의 JSON으로 옆에 저장하면 캐시 한 쌍이 된다.
- 입 모양·자막 동기화에는 원문 기준인 `alignment`를 쓰는 편이 맞다(숫자 읽기 등 정규화로 글자가 바뀌면 `normalized_alignment`는 원문과 어긋남).

## 2. 한국어 목소리 후보

- 한국어 지원 모델: **Multilingual v2**(29개 언어, 요청당 10,000자), **Flash v2.5**(32개 언어, 40,000자). v3/v4는 언어 수(70+/90+)만 있고 한국어 명시는 없음
  ([TTS 기능 문서](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)).
- "모든 ElevenLabs 목소리는 다국어"이지만, 자연스러운 결과를 위해 **목표 언어 억양을 가진 목소리**를 고르라고 권한다(같은 문서).
- **중요한 제약 두 가지** ([Voices 문서](https://elevenlabs.io/docs/overview/capabilities/voices)):
  - 기존 **Default(기본 제공) 목소리는 2026-12-31에 만료**되어 이후 접근 불가. 대체 목소리가 나온다고만 적혀 있다.
  - **Voice Library 목소리는 무료 요금제에서 API로 쓸 수 없다.**
- 결론: 공식 문서에는 "한국어에 자연스러운 남성 기본 목소리" 목록이 없다. 특정 voice_id 두 개는 문서로 확정할 수 없었다.
  권장 방식: 유료(Starter 이상)에서 Voice Library를 언어=한국어, 성별=남성으로 걸러 두 개(차분한 내레이터형=아바타, 밝은 대화형=인터뷰어)를 골라 귀로 비교. 아니면 Voice Design으로 직접 만들기. Default 목소리를 고르면 두 달 뒤 사라지므로 피한다.
  voice_id는 코드에 박지 말고 .env/설정값으로 둔다.

## 3. 크레딧으로 대본 한 벌을 몇 번 만들 수 있나

요금 ([pricing](https://elevenlabs.io/pricing)): TTS는 Multilingual v2 기준 **1글자 = 1크레딧**, Flash v2.5는 API에서 0.5~1크레딧/글자.

| 요금제 | 월 가격 | 월 크레딧 | 상업 이용 |
|---|---|---|---|
| Free | $0 | 10,000 | 불가 |
| Starter | $6 | 30,000 | 가능 |
| Creator | $22 (첫 달 $11) | 121,000 | 가능 |

추정: 한국어 낭독은 공백 포함 분당 약 300~350자(가정, 공식 수치 아님) → 5~10분 대본 ≈ **1,500~3,500자**.

| 요금제 | v2 기준 한 벌 생성 횟수/월 | Flash(0.5) 최대 |
|---|---|---|
| Free | 약 3~6회 | 약 6~13회 |
| Starter | 약 8~20회 | 약 17~40회 |
| Creator | 약 35~80회 | 약 69~160회 |

캐시를 쓰면 대본이 바뀐 장면만 다시 만들면 되므로 실제 소모는 이보다 적다.

## 4. 생성 음성을 파일로 캐시해도 되나

- 약관 4(c)(ii): 이용자가 Output의 권리를 가진다. 4(a): 다운로드한 Output은 약관·금지 정책 안에서 서비스 밖에서 쓸 수 있다. 캐시·저장을 금지하는 조항은 없다. 14조는 오히려 "남기고 싶은 콘텐츠는 직접 내보내라"고 한다
  ([Terms of Use](https://elevenlabs.io/terms-of-use)). → **파일 캐시는 허용으로 판단.**
- 단, **무료 요금제**는 1(c)(i) 비상업 목적만 가능하고, 공개 시 제목에 "elevenlabs.io" 또는 "11.ai" 표기가 필요하며, 무료 시절 생성분은 나중에 유료로 바꿔도 표기 의무가 남는다
  ([도움말](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)).
- 개인 홈페이지 소개라도 공개 배포·포트폴리오 용도라면, 최종 음성은 **Starter 이상에서 생성**한 것을 캐시하는 편이 안전하다.

## 요약 결정
- API: `/with-timestamps`, `alignment` 사용, mp3+json 쌍으로 캐시.
- 모델: `eleven_multilingual_v2`(품질) — 반복 테스트는 Flash v2.5.
- 목소리: Default는 2026-12-31 만료라 제외, Starter에서 Library 한국어 남성 2개를 골라 voice_id를 설정값으로.
- 요금: 개발 중 Free로 시험, 최종 생성은 Starter($6, 30,000크레딧 ≈ 대본 8~20벌).
