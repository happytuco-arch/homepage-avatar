// 사이트 자료 스냅숏을 assets/site-snapshot.json 으로 저장합니다(키가 없을 때 쓰는 자료).
// 사용: SUPABASE_URL=… SUPABASE_KEY=… npm run snapshot
//      (없으면 .env, 그다음 옆 폴더 ../my-homepage/.env.local 에서 읽습니다)
const fs = require('fs')
const path = require('path')
const { fetchLive, SNAPSHOT } = require('../src/main/siteData')

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = readEnvFile(path.join(__dirname, '..', '.env'))
const site = readEnvFile(path.join(__dirname, '..', '..', 'my-homepage', '.env.local'))
const url = process.env.SUPABASE_URL || env.SUPABASE_URL || site.VITE_SUPABASE_URL
const key = process.env.SUPABASE_KEY || env.SUPABASE_KEY || site.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_KEY 를 찾지 못했습니다.')
  process.exit(1)
}

fetchLive(url, key).then((data) => {
  fs.writeFileSync(SNAPSHOT, JSON.stringify(data, null, 2) + '\n')
  console.log(`저장: 작품 ${data.works.length} · 논문 ${data.papers.length} · 과제 ${data.assignments.length}`)
})
