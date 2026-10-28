// ElevenLabs 음성 합성(글자 단위 타임스탬프)과 음성 인식. 같은 대사는 파일 캐시를 다시 씁니다.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { mouthTimeline } = require('./lipsync')

// 오류 메시지에 키처럼 보이는 값이 섞여 나오면 가립니다(로그에 키가 남지 않게)
const mask = (s) => String(s).replace(/sk[-_][A-Za-z0-9_-]{6,}/g, 'sk-***').slice(0, 200)
const API = 'https://api.elevenlabs.io/v1'
const TTS_MODEL = 'eleven_multilingual_v2'
const STT_MODEL = 'scribe_v1'
const TTS_TIMEOUT_MS = 30000

function cacheKey(voiceId, text) {
  return crypto.createHash('sha1').update(`${TTS_MODEL}|${voiceId}|${text}`).digest('hex')
}

// 앱에 함께 넣어 배포하는 대본 음성(scripts/bake-voice.js 로 만듦). 키가 없어도 이 대사들은 ElevenLabs 목소리로 나옵니다
const BUNDLED_DIR = path.join(__dirname, '..', '..', 'assets', 'voice')

/** 동봉 음성이나 저장해 둔 음성이 있으면 돌려주고, 없으면 null (크레딧을 쓰지 않음) */
function findSaved(voiceId, text, cacheDir) {
  const name = cacheKey(voiceId, text) + '.json'
  for (const dir of [BUNDLED_DIR, cacheDir]) {
    const file = path.join(dir, name)
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  return null
}

/** { audio: base64 mp3, chars: [시작초…], mouth: [{t0,t1,v}] } 또는 예외 */
async function synthesize({ key, voiceId, text, cacheDir }) {
  const saved = findSaved(voiceId, text, cacheDir)
  if (saved) return saved
  const base = path.join(cacheDir, cacheKey(voiceId, text))

  const res = await fetch(`${API}/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: TTS_MODEL }),
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${mask(await res.text())}`)
  const body = await res.json()
  const al = body.alignment || body.normalized_alignment
  const out = {
    audio: body.audio_base64,
    chars: al ? al.character_start_times_seconds : [],
    mouth: mouthTimeline(al),
  }
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(base + '.mp3', Buffer.from(out.audio, 'base64'))
  fs.writeFileSync(base + '.json', JSON.stringify(out))
  return out
}

async function transcribe({ key, audio, mime }) {
  const form = new FormData()
  form.append('model_id', STT_MODEL)
  form.append('language_code', 'kor')
  form.append('file', new Blob([audio], { type: mime || 'audio/webm' }), 'question.webm')
  const res = await fetch(`${API}/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': key }, body: form })
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${mask(await res.text())}`)
  return ((await res.json()).text || '').trim()
}

module.exports = { synthesize, transcribe, cacheKey, findSaved, BUNDLED_DIR }
