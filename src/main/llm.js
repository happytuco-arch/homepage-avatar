// Claude 호출. 대본 만들기와 직접 질문 답하기. 사실은 사이트 자료에서만 가져오게 지시합니다.
const fs = require('fs')
const path = require('path')
const { hashData } = require('./siteData')
const { buildTemplateScript, matchFaq, NOT_ON_SITE } = require('./template')

// 오류 메시지에 키처럼 보이는 값이 섞여 나오면 가립니다(로그에 키가 남지 않게)
const mask = (s) => String(s).replace(/sk[-_][A-Za-z0-9_-]{6,}/g, 'sk-***').slice(0, 200)
const API = 'https://api.anthropic.com/v1/messages'
const SCRIPT_TIMEOUT_MS = 90000
const ANSWER_TIMEOUT_MS = 20000
const SCRIPT_PROMPT_VERSION = 'v2' // 프롬프트를 고치면 올려서 캐시를 새로 만듭니다

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

const SCRIPT_SYSTEM = `너는 홈페이지 주인의 아바타가 말할 투어 대본을 쓰는 작가다.
규칙:
- 사실(작품·논문·과제의 제목, 내용, 연도, 주차)은 반드시 주어진 사이트 자료 JSON에서만 가져온다. 자료에 없는 사실, 수치, 감상 이유를 지어내지 않는다.
- 사이트 글을 그대로 읽지 말고, 핵심을 골라 사람이 직접 소개하듯 자연스러운 한국어 대화체(해요체)로 다시 구성한다.
- 인터뷰어(who: "interviewer")가 짧게 묻고 아바타(who: "avatar")가 답하는 흐름을 섞는다. 대사 한 줄은 80자 이내.
- 장면 순서: intro(page null, 첫 줄 act "wave") → works(page "Works") → papers(page "Papers") → assignments(page "Assignments") → outro(page null, 마지막 줄 act "bow", 짧은 감사 인사).
- 각 페이지 장면에서 2~3개 항목을 골라, 그 항목을 말하는 아바타 줄에 focus를 단다: works는 {"kind":"card","title":<정확한 제목>}, papers·assignments는 {"kind":"post","title":<정확한 제목>}. 페이지 장면 첫 아바타 줄에는 act "point".
- 전체 대사는 말로 5~7분 분량(약 1800~2400자).
- faq: 방문자가 물을 만한 질문 10개와, 자료에 근거한 2~3문장 답.
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

/** 대본 가져오기: 캐시 → Claude → 템플릿 순서 */
async function getScript({ cfg, data, cacheDir }) {
  const file = path.join(cacheDir, `script-${SCRIPT_PROMPT_VERSION}-${hashData(data)}.json`)
  if (fs.existsSync(file)) return { ...JSON.parse(fs.readFileSync(file, 'utf8')), source: 'cache' }
  if (!cfg.anthropicKey) return buildTemplateScript(data)
  try {
    const script = await claude({
      key: cfg.anthropicKey, model: cfg.scriptModel, system: SCRIPT_SYSTEM,
      user: `사이트 자료:\n${JSON.stringify(data)}`, maxTokens: 8000, timeoutMs: SCRIPT_TIMEOUT_MS, tool: SCRIPT_TOOL,
    })
    if (!validScript(script)) throw new Error('대본 형식이 맞지 않음')
    if (!Array.isArray(script.faq)) script.faq = buildTemplateScript(data).faq
    // 사이트 자료에 없는 제목을 짚으라는 focus 는 지웁니다(지어낸 항목을 강조하지 않음)
    const titles = new Set(['works', 'papers', 'assignments'].flatMap((k) => (data[k] || []).map((x) => x.title)))
    for (const sc of script.scenes) for (const l of sc.lines) if (l.focus && !titles.has(l.focus.title)) delete l.focus
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(script, null, 2))
    return { ...script, source: 'claude' }
  } catch (err) {
    console.warn('[llm] 대본 생성 실패, 템플릿 사용:', err.message)
    return { ...buildTemplateScript(data), error: err.message }
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
        user: `사이트 자료:\n${JSON.stringify(data)}\n\n질문: ${question}`, maxTokens: 400, timeoutMs: ANSWER_TIMEOUT_MS,
      })
      return { text: text.trim(), source: 'claude' }
    } catch (err) {
      console.warn('[llm] 답변 실패, 질문 목록 사용:', err.message)
    }
  }
  const hit = matchFaq(question, faq)
  return { text: hit ? hit.a : NOT_ON_SITE, source: 'faq' }
}

module.exports = { getScript, answer, extractJson, validScript }
