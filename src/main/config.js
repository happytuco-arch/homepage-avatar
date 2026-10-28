// 설정 읽기. 키는 메인 프로세스에서만 읽고, 렌더러에는 "있다/없다"만 알립니다.
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const SITE_URL = 'https://my-homepage-jh-f22e.vercel.app'

// ElevenLabs 기본 목소리 — 아바타 Brian(남) · 인터뷰어 Jessica(여). 동봉 음성(assets/voice)도 이 두 목소리로 만들었습니다.
// 목소리를 바꾸면 동봉 음성과 맞지 않아 새로 생성합니다(.env 의 VOICE_AVATAR · VOICE_INTERVIEWER).
const DEFAULT_VOICE_AVATAR = 'nPczCjzI2devNBz1zQrb'
const DEFAULT_VOICE_INTERVIEWER = 'cgSgspJ2msm6clMCkdW9'

const DEFAULT_SCRIPT_MODEL = 'claude-sonnet-5-5'
const DEFAULT_ANSWER_MODEL = 'claude-haiku-5-5'

// 목소리 ID는 영문·숫자 15~40자. 키 같은 값이 잘못 들어오면 외부로 보내지 않고 기본 목소리를 씁니다
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{15,40}$/
function voiceId(value, fallback, name) {
  if (!value) return fallback
  if (VOICE_ID_PATTERN.test(value.trim())) return value.trim()
  console.warn(`[config] ${name} 값이 목소리 ID 형식이 아닙니다(키를 넣으셨나요?). 기본 목소리를 씁니다.`)
  return fallback
}

/** .env 를 찾는 순서: 작업 폴더 → 실행 파일 옆 → 사용자 데이터 폴더 */
function loadConfig(app) {
  const candidates = [path.join(process.cwd(), '.env')]
  if (app) {
    candidates.push(path.join(path.dirname(app.getPath('exe')), '.env'))
    candidates.push(path.join(app.getPath('userData'), '.env'))
  }
  const found = candidates.find((p) => fs.existsSync(p))
  if (found) dotenv.config({ path: found, quiet: true })

  const env = process.env
  return {
    envFile: found || null,
    siteUrl: env.SITE_URL || SITE_URL,
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseKey: env.SUPABASE_KEY || '',
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    elevenKey: env.ELEVENLABS_API_KEY || '',
    voiceAvatar: voiceId(env.VOICE_AVATAR, DEFAULT_VOICE_AVATAR, 'VOICE_AVATAR'),
    voiceInterviewer: voiceId(env.VOICE_INTERVIEWER, DEFAULT_VOICE_INTERVIEWER, 'VOICE_INTERVIEWER'),
    scriptModel: env.CLAUDE_SCRIPT_MODEL || DEFAULT_SCRIPT_MODEL,
    answerModel: env.CLAUDE_ANSWER_MODEL || DEFAULT_ANSWER_MODEL,
  }
}

module.exports = { loadConfig }
