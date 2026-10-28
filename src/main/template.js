// 키가 없을 때 쓰는 기본 대본과 질문 목록, 그리고 질문 목록 매칭.
// 사실은 모두 사이트 자료(data)에서만 가져옵니다. 문장 틀만 코드에 있습니다.

const MAX_ITEMS_PER_PAGE = 2 // 페이지마다 짚어 줄 항목 수
const SUMMARY_CHARS = 90 // 설명을 대사로 옮길 때 자르는 길이

function clip(text, n = SUMMARY_CHARS) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다. '), cut.lastIndexOf(', '))
  return (stop > 30 ? cut.slice(0, stop + 1) : cut) + '…'
}

function weekOf(week) {
  const n = String(week || '').match(/\d+/)
  return n ? n[0] + '주차 ' : ''
}

function firstSentence(text) {
  const t = clip(text, 200)
  const m = t.match(/^(.+?[.!?]|.+?다\.)(\s|$)/)
  return clip(m ? m[1] : t)
}

function buildTemplateScript(data) {
  const works = (data.works || []).slice(0, MAX_ITEMS_PER_PAGE)
  const papers = (data.papers || []).slice(0, MAX_ITEMS_PER_PAGE)
  const tasks = (data.assignments || []).slice(0, MAX_ITEMS_PER_PAGE)

  const scenes = [
    {
      id: 'intro',
      page: null,
      lines: [
        { who: 'avatar', act: 'wave', text: '안녕하세요! 오늘은 제 홈페이지를 제가 직접 넘겨 가면서 소개해 드릴게요.' },
        { who: 'interviewer', text: '좋아요. 어떤 것들이 들어 있는지 먼저 들어 볼까요?' },
        { who: 'avatar', text: `크게 세 가지예요. 만든 작품 ${data.works?.length || 0}개, 읽고 정리한 논문 ${data.papers?.length || 0}편, 그리고 수업 과제 ${data.assignments?.length || 0}개입니다.` },
      ],
    },
  ]

  if (works.length) {
    scenes.push({
      id: 'works',
      page: 'Works',
      lines: [
        { who: 'avatar', act: 'point', text: '먼저 작품부터 볼게요.' },
        ...works.flatMap((w, i) => [
          { who: 'interviewer', text: i === 0 ? `"${w.title}"은 어떤 작품이에요?` : `"${w.title}"도 궁금한데요?` },
          { who: 'avatar', focus: { kind: 'card', title: w.title }, text: w.description ? `${w.title}은요, 한마디로 하면 ${firstSentence(w.description)}` : `${w.title}은 제가 직접 만든 작품이에요. 화면에서 바로 보실 수 있어요.` },
        ]),
      ],
    })
  }

  if (papers.length) {
    scenes.push({
      id: 'papers',
      page: 'Papers',
      lines: [
        { who: 'interviewer', text: '작품 말고 공부한 것도 있나요?' },
        { who: 'avatar', act: 'point', text: '네, 논문을 읽고 제 말로 정리해 두었어요.' },
        ...papers.map((p, i) => ({
          who: 'avatar',
          focus: { kind: 'post', title: p.title },
          text: `${p.year ? p.year + '년에 나온 ' : ''}"${p.title}"는 ${firstSentence(p.summary || p.abstract || '제가 관심 있게 읽은 논문이에요.')}`,
        })),
      ],
    })
  }

  if (tasks.length) {
    scenes.push({
      id: 'assignments',
      page: 'Assignments',
      lines: [
        { who: 'interviewer', text: '수업 과제는 어떻게 정리했어요?' },
        { who: 'avatar', act: 'point', text: '주차별로 프롬프트와 결과물을 함께 올려 두었어요.' },
        ...tasks.map((a, i) => ({
          who: 'avatar',
          focus: { kind: 'post', title: a.title },
          text: `${weekOf(a.week)}"${a.title}" 과제는 ${firstSentence(a.note || a.prompt || '프롬프트와 결과물을 함께 볼 수 있어요.')}`,
        })),
      ],
    })
  }

  scenes.push({
    id: 'outro',
    page: null,
    lines: [
      { who: 'interviewer', text: '마지막으로 한마디 해 주세요.' },
      { who: 'avatar', text: '끝까지 봐 주셔서 감사합니다. 궁금한 점은 언제든 아래에 물어봐 주세요.' },
      { who: 'avatar', act: 'bow', text: '감사합니다!' },
    ],
  })

  return { scenes, faq: buildTemplateFaq(data), source: 'template' }
}

function buildTemplateFaq(data) {
  const faq = [
    {
      q: '홈페이지에는 어떤 내용이 있나요?',
      a: `작품 ${data.works?.length || 0}개, 논문 정리 ${data.papers?.length || 0}편, 수업 과제 ${data.assignments?.length || 0}개가 있어요.`,
    },
  ]
  for (const w of (data.works || []).slice(0, 4)) {
    faq.push({ q: `${w.title}은 어떤 작품인가요?`, a: w.description ? clip(w.description, 150) : `${w.title}은 제가 만든 작품이에요.` })
  }
  for (const p of (data.papers || []).slice(0, 3)) {
    faq.push({ q: `${p.title} 논문은 무슨 내용인가요?`, a: clip(p.summary || p.abstract || '제가 읽고 정리한 논문이에요.', 150) })
  }
  for (const a of (data.assignments || []).slice(0, 2)) {
    faq.push({ q: `${a.title} 과제는 무엇인가요?`, a: clip(a.note || a.prompt || '프롬프트와 결과물을 함께 올려 둔 과제예요.', 150) })
  }
  return faq.slice(0, 10)
}

// 글자 두 개씩 묶은 조각이 얼마나 겹치는지로 가장 가까운 질문을 고릅니다.
function bigrams(s) {
  const t = String(s || '').replace(/\s+/g, '').toLowerCase()
  const set = new Set()
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2))
  return set
}

const MIN_MATCH_SCORE = 0.2

function matchFaq(question, faq) {
  const qb = bigrams(question)
  let best = null
  let bestScore = 0
  for (const item of faq || []) {
    const ib = bigrams(item.q)
    let common = 0
    for (const g of qb) if (ib.has(g)) common++
    const score = common / Math.max(1, Math.min(qb.size, ib.size))
    if (score > bestScore) { best = item; bestScore = score }
  }
  return bestScore >= MIN_MATCH_SCORE ? best : null
}

const NOT_ON_SITE = '음, 그 내용은 제 홈페이지에는 없어요. 작품이나 논문, 과제에 대해 물어봐 주시면 답해 드릴게요.'

module.exports = { buildTemplateScript, buildTemplateFaq, matchFaq, clip, NOT_ON_SITE }
