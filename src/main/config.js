// 설정 읽기. 키는 메인 프로세스에서만 읽고, 렌더러에는 "있다/없다"만 알립니다.
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const SITE_URL = 'https://my-homepage-jh-f22e.vercel.app'

// ElevenLabs 기본 목소리 (2026-12-31까지 사용 가능). Starter 가입 뒤 .env 에서 바꿉니다.
const DEFAULT_VOICE_AVATAR = 'pNInz6obpgDQGcFmaJgB'
const DEFAULT_VOICE_INTERVIEWER = 'JBFqnCBsd6RMkjVDRZzb'

const DEFAULT_SCRIPT_MODEL = 'claude-sonnet-5-5'
const DEFAULT_ANSWER_MODEL = 'claude-haiku-5-5'

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
    voiceAvatar: env.VOICE_AVATAR || DEFAULT_VOICE_AVATAR,
    voiceInterviewer: env.VOICE_INTERVIEWER || DEFAULT_VOICE_INTERVIEWER,
    scriptModel: env.CLAUDE_SCRIPT_MODEL || DEFAULT_SCRIPT_MODEL,
    answerModel: env.CLAUDE_ANSWER_MODEL || DEFAULT_ANSWER_MODEL,
  }
}

module.exports = { loadConfig }
