// 동봉 각색 대본 만들기: 스냅숏 자료로 Claude 대본을 생성해 assets/default-script.json 에 저장합니다.
// 키가 없는 시연 환경에서도 각색된 대본으로 투어하게 하려는 것입니다.
// 사용: npm run bake  (.env 의 ANTHROPIC_API_KEY 필요)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadConfig } = require('../src/main/config')
const { getScript } = require('../src/main/llm')
const { hashData } = require('../src/main/siteData')

const OUT = path.join(__dirname, '..', 'assets', 'default-script.json')

async function main() {
  const cfg = loadConfig(null)
  if (!cfg.anthropicKey) throw new Error('.env 에 ANTHROPIC_API_KEY 가 없습니다.')
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'site-snapshot.json'), 'utf8'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bake-'))
  const script = await getScript({ cfg, data, cacheDir: tmp, fresh: true })
  if (script.source !== 'claude') throw new Error('생성 실패: ' + (script.error || script.source))
  const { source, ...clean } = script
  clean.dataHash = hashData(data) // 실행 때 자료가 같으면 이 대본을 바로 씁니다
  fs.writeFileSync(OUT, JSON.stringify(clean, null, 2) + '\n')
  const chars = clean.scenes.flatMap((s) => s.lines).reduce((n, l) => n + l.text.length, 0)
  console.log(`저장: 장면 ${clean.scenes.length} · 대사 ${chars}자 · 질문 ${clean.faq.length}개`)
}

main().catch((err) => { console.error(err.message); process.exit(1) })
