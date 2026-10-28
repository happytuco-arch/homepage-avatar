// Claude 호출. 대본 만들기와 직접 질문 답하기. 사실은 사이트 자료에서만 가져오게 지시합니다.
const fs = require('fs')
const path = require('path')
const { hashData } = require('./siteData')
const { buildTemplateScript, matchFaq, NOT_ON_SITE } = require('./template')

// 오류 메시지에 키처럼 보이는 값이 섞여 나오면 가립니다(로그에 키가 남지 않게)
const mask = (s) => String(s).replace(/sk[-_][A-Za-z0-9_-]{6,}/g, 'sk-***').slice(0, 200)
const API = 'https://api.anthropic.com/v1/messages'
const SCRIPT_TIMEOUT_MS = 240000
const ANSWER_TIMEOUT_MS = 20000
const SCRIPT_PROMPT_VERSION = 'v3' // 프롬프트를 고치면 올려서 캐시를 새로 만듭니다

/** tool 을 주면 그 도구를 쓰게 해(이 모델은 강제 지정을 지원하지 않아 auto + 지시문) 입력(JSON 객체)을 돌려받고, 없으면 글을 돌려받습니다 */
async function claude({ key, model, system, user, maxTokens, timeoutMs, tool }) {
  const body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }
  if (tool) Object.assign(body, { tools: [tool], tool_choice: { type: 'auto' } })
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${mask(await res.text())}`)
  const out = await res.json()
  if (tool) return out.content.find((c) => c.type === 'tool_use')?.input
  return out.content.filter((c) => c.type === 'text').map((c) => c.text).join('')
}

// 대본 모양을 도구 입력 형식으로 강제합니다(글로 받은 JSON은 따옴표 때문에 깨질 수 있음)
const FOCUS = { type: 'object', properties: { kind: { enum: ['card', 'post'] }, title: { type: 'string' } }, required: ['kind', 'title'] }
const SCRIPT_TOOL = {
  name: 'write_script',
  description: '완성한 투어 대본과 질문 목록을 제출한다.',
  input_schema: {
    type: 'object',
    properties: {
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            page: { enum: ['Works', 'Papers', 'Assignments', null] },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  who: { enum: ['avatar', 'interviewer'] },
                  text: { type: 'string' },
                  act: { enum: ['wave', 'point', 'bow'] },
                  focus: FOCUS,
                },
                required: ['who', 'text'],
              },
            },
          },
          required: ['id', 'page', 'lines'],
        },
      },
      faq: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'] } },
    },
    required: ['scenes', 'faq'],
  },
}

const SCRIPT_SYSTEM = `너는 포트폴리오 발표 대본 작가다. 홈페이지 주인 본인(아바타)이 청중 앞에서 자기 작업을 소개하고, 인터뷰어가 곁에서 묻는 토크쇼 형식의 투어 대본을 쓴다.

사실 규칙(가장 중요):
- 제목, 내용, 수치, 연도, 주차, 사람 이름 같은 사실은 주어진 사이트 자료 JSON에 있는 것만 쓴다. 자료에 없는 사실, 동기, 일화, 감정은 지어내지 않는다.
- 해석과 연결은 해도 된다. 예: 두 작품의 공통점 짚기, 과제에서 배운 점이 다음 작업으로 이어지는 흐름 만들기. 단, 그 근거가 자료에 있어야 한다.

각색 규칙(낭독처럼 들리면 실패):
- 사이트 문장을 옮기지 말고, 발표자가 청중에게 말을 거는 말투(해요체, 1인칭)로 새로 쓴다.
- 각 항목은 "한 줄 훅 → 무엇인지 → 왜 의미 있는지/무엇을 배웠는지" 순서로 이야기처럼 풀어 말한다.
- 숫자는 한 줄에 하나만, 귀로 듣기 쉽게 반올림한다(예: 229,126개 → 약 23만 개). 퍼센트를 연달아 나열하지 않는다.
- 항목 사이는 "그런데", "이 경험이 다음 작업으로 이어졌는데요" 같은 다리 문장으로 잇는다. 목록 나열 금지.
- 인터뷰어는 청중이 궁금해할 만한 짧은 질문과 리액션("오, 23만 개요?")을 한다. 인터뷰어 줄은 30자 이내, 아바타 줄은 80자 이내.

형식:
- 장면 순서: intro(page null, 첫 줄 act "wave", 자기소개와 오늘 보여 줄 것 예고) → works(page "Works") → papers(page "Papers") → assignments(page "Assignments") → outro(page null, 오늘 이야기를 한 문장으로 묶고 질문을 청하는 마무리, 마지막 줄 act "bow").
- 페이지 장면마다 2~4개 항목을 골라, 그 항목을 처음 말하는 아바타 줄에 focus를 단다: works는 {"kind":"card","title":<자료의 정확한 제목>}, papers·assignments는 {"kind":"post","title":<자료의 정확한 제목>}. 페이지 장면 첫 아바타 줄에는 act "point".
- 전체 대사는 말로 6~8분 분량(약 2400~3000자).
- faq: 청중이 물을 만한 질문 40개와 2~3문장 답. 작품·논문·과제별 질문, 만든 방법, 배운 점, 이 홈페이지와 아바타 앱 자체에 대한 질문을 고루 넣는다. 답은 자료 근거만 쓰고, 자료에 없으면 "홈페이지에는 그 내용이 없어요"라고 답한다.
결과는 반드시 write_script 도구를 한 번 호출해 제출한다. 도구 밖에 대본을 글로 쓰지 않는다.`

function extractJson(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('JSON 없음')
  return JSON.parse(text.slice(start, end + 1))
}

function validScript(s) {
  return s && Array.isArray(s.scenes) && s.scenes.length >= 3 &&
    s.scenes.every((sc) => Array.isArray(sc.lines) && sc.lines.every((l) => l.text && (l.who === 'avatar' || l.who === 'interviewer')))
}

const MIN_FAQ = 20
const FAQ_COUNT = 40
const FAQ_TOOL = {
  name: 'write_faq',
  description: '완성한 질문 목록을 제출한다.',
  input_schema: { type: 'object', properties: { faq: SCRIPT_TOOL.input_schema.properties.faq }, required: ['faq'] },
}
const FAQ_SYSTEM = `너는 홈페이지 주인 본인(아바타)의 발표 뒤 질의응답을 준비한다.
청중(대학 수업의 교수와 학생)이 물을 만한 질문 ${FAQ_COUNT}개와 답을 만든다.
- 작품·논문·과제 각각에 대한 질문, 만든 방법, 배운 점, 어려웠던 점, 이 홈페이지와 아바타 앱 자체에 대한 질문을 고루 넣는다.
- 답은 1인칭 해요체 2~3문장, 말로 읽기 좋게. 사실은 사이트 자료에 있는 것만 쓰고, 자료에 없으면 "홈페이지에는 그 내용이 없어요"라고 답한다.
결과는 반드시 write_faq 도구를 한 번 호출해 제출한다.`

async function generateFaq(cfg, data) {
  try {
    const out = await claude({
      key: cfg.anthropicKey, model: cfg.scriptModel, system: FAQ_SYSTEM,
      user: `사이트 자료:\n${JSON.stringify(data)}`, maxTokens: 12000, timeoutMs: SCRIPT_TIMEOUT_MS, tool: FAQ_TOOL,
    })
    if (Array.isArray(out?.faq) && out.faq.length) return out.faq
  } catch (err) {
    console.warn('[llm] 질문 목록 생성 실패:', err.message)
  }
  return buildTemplateScript(data).faq
}

// 키가 없거나 생성이 실패할 때 쓰는, 미리 각색해 둔 대본(scripts/bake-script.js 로 만듦)
const BUNDLED_SCRIPT = path.join(__dirname, '..', '..', 'assets', 'default-script.json')

function fallbackScript(data) {
  if (fs.existsSync(BUNDLED_SCRIPT)) return { ...JSON.parse(fs.readFileSync(BUNDLED_SCRIPT, 'utf8')), source: 'bundled' }
  return buildTemplateScript(data)
}

/**
 * 대본 가져오기: 캐시 → 같은 자료로 만든 동봉 대본 → Claude → 동봉 대본 → 템플릿 순서.
 * 사이트 자료가 동봉 대본을 만들 때와 같으면 Claude를 부르지 않아 첫 실행도 바로 시작합니다.
 */
async function getScript({ cfg, data, cacheDir, fresh = false }) {
  const hash = hashData(data)
  const file = path.join(cacheDir, `script-${SCRIPT_PROMPT_VERSION}-${hash}.json`)
  if (!fresh && fs.existsSync(file)) return { ...JSON.parse(fs.readFileSync(file, 'utf8')), source: 'cache' }
  const bundled = fallbackScript(data)
  if (!fresh && bundled.dataHash === hash) return bundled
  if (!cfg.anthropicKey) return bundled
  try {
    const script = await claude({
      key: cfg.anthropicKey, model: cfg.scriptModel, system: SCRIPT_SYSTEM,
      user: `사이트 자료:\n${JSON.stringify(data)}`, maxTokens: 16000, timeoutMs: SCRIPT_TIMEOUT_MS, tool: SCRIPT_TOOL,
    })
    if (!validScript(script)) throw new Error('대본 형식이 맞지 않음')
    // 대본과 한 번에 받으면 질문 목록이 빠지거나 짧게 오는 일이 있어, 모자라면 따로 한 번 더 받습니다
    if (!Array.isArray(script.faq) || script.faq.length < MIN_FAQ) script.faq = await generateFaq(cfg, data)
    // 사이트 자료에 없는 제목을 짚으라는 focus 는 지웁니다(지어낸 항목을 강조하지 않음)
    const titles = new Set(['works', 'papers', 'assignments'].flatMap((k) => (data[k] || []).map((x) => x.title)))
    for (const sc of script.scenes) for (const l of sc.lines) if (l.focus && !titles.has(l.focus.title)) delete l.focus
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(script, null, 2))
    return { ...script, source: 'claude' }
  } catch (err) {
    console.warn('[llm] 대본 생성 실패, 동봉 대본 사용:', err.message)
    return { ...fallbackScript(data), error: err.message }
  }
}

const ANSWER_SYSTEM = `너는 홈페이지 주인 본인(아바타)으로서, 방문자의 질문에 1인칭 해요체로 답한다.
- 반드시 주어진 사이트 자료 JSON에 있는 사실만 쓴다. 자료에 근거가 없으면 지어내지 말고 "그 내용은 제 홈페이지에는 없어요"라고 말한 뒤, 관련된 페이지(Works·Papers·Assignments)가 있으면 안내만 한다.
- 2~3문장, 150자 안팎. 말로 읽을 문장이므로 목록·마크다운·이모지를 쓰지 않는다.`

/** 직접 질문 답하기: Claude → (키·인터넷 없음) 질문 목록 */
async function answer({ cfg, data, faq, question }) {
  if (cfg.anthropicKey) {
    try {
      const text = await claude({
        key: cfg.anthropicKey, model: cfg.answerModel, system: ANSWER_SYSTEM,
        user: `사이트 자료:\n${JSON.stringify(data)}\n\n질문: ${question}`, maxTokens: 1000, timeoutMs: ANSWER_TIMEOUT_MS,
      })
      return { text: text.trim(), source: 'claude' }
    } catch (err) {
      console.warn('[llm] 답변 실패, 질문 목록 사용:', err.message)
    }
  }
  const hit = matchFaq(question, faq)
  return { text: hit ? hit.a : NOT_ON_SITE, source: 'faq' }
}

module.exports = { getScript, answer, generateFaq, extractJson, validScript, SCRIPT_PROMPT_VERSION }
