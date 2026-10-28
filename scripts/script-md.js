// 동봉 대본 ↔ 읽기 쉬운 문서(docs/대본.md) 변환.
//   npm run script:md     → assets/default-script.json 을 docs/대본.md 로 씁니다(검토용)
//   npm run script:apply  → docs/대본.md 에서 고친 대사를 assets/default-script.json 에 반영합니다
// 문서의 한 줄 형식:  - **아바타** [인사] {강조: 제목} 대사
const fs = require('fs')
const path = require('path')

const JSON_FILE = path.join(__dirname, '..', 'assets', 'default-script.json')
const MD_FILE = path.join(__dirname, '..', 'docs', '대본.md')
const WHO = { avatar: '아바타', interviewer: '인터뷰어' }
const ACT = { wave: '손 흔들기', point: '가리키기', bow: '90도 인사' }
const PAGE = { Works: '작품', Papers: '논문', Assignments: '과제', About: '소개' }
const rev = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]))

function toMd(s) {
  const out = ['# 투어 대본', '', '> 대사를 고친 뒤 `npm run script:apply` 를 실행하면 앱에 반영됩니다.',
    '> 줄 앞의 **이름**, [동작], {강조: 제목} 표시는 그대로 두고 대사 부분만 고쳐 주세요.', '']
  for (const sc of s.scenes) {
    out.push(`## ${sc.id}${sc.page ? ` — ${PAGE[sc.page]} 페이지(${sc.page})` : ''}`, '')
    for (const l of sc.lines) {
      const act = l.act ? ` [${ACT[l.act]}]` : ''
      const focus = l.focus ? ` {강조: ${l.focus.title}}` : ''
      out.push(`- **${WHO[l.who]}**${act}${focus} ${l.text}`)
    }
    out.push('')
  }
  out.push('## 질문 목록 (키가 없을 때 쓰는 답)', '')
  s.faq.forEach((f, i) => out.push(`${i + 1}. **Q.** ${f.q}`, `   **A.** ${f.a}`))
  return out.join('\n') + '\n'
}

function applyMd(s, md) {
  const lines = md.split(/\r?\n/).filter((l) => l.startsWith('- **'))
  const all = s.scenes.flatMap((sc) => sc.lines)
  if (lines.length !== all.length) throw new Error(`대사 줄 수가 다릅니다(문서 ${lines.length}줄, 대본 ${all.length}줄). 줄을 더하거나 지우려면 알려 주세요.`)
  const whoOf = rev(WHO)
  lines.forEach((l, i) => {
    const m = l.match(/^- \*\*(.+?)\*\*(?: \[(.+?)\])?(?: \{강조: (.+?)\})? (.*)$/)
    if (!m) throw new Error(`형식이 깨진 줄: ${l}`)
    all[i].who = whoOf[m[1]] || all[i].who
    all[i].text = m[4].trim()
  })
  return s
}

const s = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'))
if (process.argv[2] === 'apply') {
  fs.writeFileSync(JSON_FILE, JSON.stringify(applyMd(s, fs.readFileSync(MD_FILE, 'utf8')), null, 2) + '\n')
  console.log('반영했습니다:', JSON_FILE)
} else {
  fs.writeFileSync(MD_FILE, toMd(s))
  console.log('썼습니다:', MD_FILE)
}
