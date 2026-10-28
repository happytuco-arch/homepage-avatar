// 동봉 음성 만들기: 대본의 모든 대사를 ElevenLabs 목소리로 만들어 assets/voice/ 에 넣습니다.
// 앱을 받은 사람이 키가 없어도 대본은 이 목소리로 듣게 하려는 것입니다.
// 이미 이 컴퓨터에 저장된 음성은 그대로 옮기고, 없는 대사만 새로 만듭니다(그만큼만 크레딧 사용).
// 사용: npm run bake:voice  (.env 의 ELEVENLABS_API_KEY 필요)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadConfig } = require('../src/main/config')
const { synthesize, cacheKey, BUNDLED_DIR } = require('../src/main/voice')

// 앱이 쓰는 사용자 데이터 폴더의 음성 저장소(Windows 기준, Mac 은 Library/Application Support)
const USER_CACHE = process.platform === 'win32'
  ? path.join(process.env.APPDATA, 'homepage-avatar', 'audio-cache')
  : path.join(os.homedir(), 'Library', 'Application Support', 'homepage-avatar', 'audio-cache')

async function main() {
  const cfg = loadConfig(null)
  const script = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'default-script.json'), 'utf8'))
  const lines = script.scenes.flatMap((s) => s.lines)
  fs.mkdirSync(BUNDLED_DIR, { recursive: true })

  const keep = new Set()
  let reused = 0
  let made = 0
  let chars = 0
  for (const l of lines) {
    const voiceId = l.who === 'interviewer' ? cfg.voiceInterviewer : cfg.voiceAvatar
    const name = cacheKey(voiceId, l.text) + '.json'
    keep.add(name)
    const dest = path.join(BUNDLED_DIR, name)
    if (fs.existsSync(dest)) { reused++; continue }
    const cached = path.join(USER_CACHE, name)
    if (fs.existsSync(cached)) { fs.copyFileSync(cached, dest); reused++; continue }
    if (!cfg.elevenKey) throw new Error('.env 에 ELEVENLABS_API_KEY 가 없습니다.')
    const out = await synthesize({ key: cfg.elevenKey, voiceId, text: l.text, cacheDir: USER_CACHE })
    fs.writeFileSync(dest, JSON.stringify(out))
    made++
    chars += l.text.length
    process.stdout.write('.')
  }
  // 대본에서 빠진 대사의 음성은 지웁니다
  for (const f of fs.readdirSync(BUNDLED_DIR)) if (!keep.has(f)) fs.unlinkSync(path.join(BUNDLED_DIR, f))
  console.log(`\n동봉 음성 ${keep.size}개 (기존 ${reused} · 새로 ${made}, 약 ${chars}자 사용)`)
}

main().catch((err) => { console.error(err.message); process.exit(1) })
