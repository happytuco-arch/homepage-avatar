// ElevenLabs 음성 합성(글자 단위 타임스탬프)과 음성 인식. 같은 대사는 파일 캐시를 다시 씁니다.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { mouthTimeline } = require('./lipsync')

const API = 'https://api.elevenlabs.io/v1'
const TTS_MODEL = 'eleven_multilingual_v2'
const STT_MODEL = 'scribe_v1'
const TTS_TIMEOUT_MS = 30000

function cacheKey(voiceId, text) {
  return crypto.createHash('sha1').update(`${TTS_MODEL}|${voiceId}|${text}`).digest('hex')
}

/** { audio: base64 mp3, chars: [시작초…], mouth: [{t0,t1,v}] } 또는 예외 */
async function synthesize({ key, voiceId, text, cacheDir }) {
  const base = path.join(cacheDir, cacheKey(voiceId, text))
  if (fs.existsSync(base + '.json')) return JSON.parse(fs.readFileSync(base + '.json', 'utf8'))

  const res = await fetch(`${API}/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: TTS_MODEL }),
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`)
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
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()).text || '').trim()
}

module.exports = { synthesize, transcribe, cacheKey }
