// 순수 함수 테스트: 입 모양, 기본 대본, 질문 목록 매칭, 음성 캐시 키
const test = require('node:test')
const assert = require('node:assert')
const { mouthOf, mouthTimeline } = require('../src/main/lipsync')
const { buildTemplateScript, matchFaq, NOT_ON_SITE } = require('../src/main/template')
const { cacheKey } = require('../src/main/voice')
const { extractJson, validScript } = require('../src/main/llm')
const snapshot = require('../assets/site-snapshot.json')

test('한글 모음을 입 모양으로 바꾼다', () => {
  assert.strictEqual(mouthOf('가'), 'aa')
  assert.strictEqual(mouthOf('이'), 'ih')
  assert.strictEqual(mouthOf('우'), 'ou')
  assert.strictEqual(mouthOf('에'), 'ee')
  assert.strictEqual(mouthOf('오'), 'oh')
  assert.strictEqual(mouthOf(' '), null)
  assert.strictEqual(mouthOf('.'), null)
})

test('같은 입 모양이 이어지면 한 구간으로 합친다', () => {
  const tl = mouthTimeline({
    characters: ['가', '나', ' ', '이'],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4],
  })
  assert.deepStrictEqual(tl, [{ t0: 0, t1: 0.2, v: 'aa' }, { t0: 0.3, t1: 0.4, v: 'ih' }])
})

test('기본 대본: 인사로 시작해 90도 인사로 끝나고, 세 페이지를 순서대로 지난다', () => {
  const s = buildTemplateScript(snapshot)
  assert.strictEqual(s.scenes[0].lines[0].act, 'wave')
  assert.strictEqual(s.scenes.at(-1).lines.at(-1).act, 'bow')
  assert.deepStrictEqual(s.scenes.map((x) => x.page).filter(Boolean), ['Works', 'Papers', 'Assignments'])
  assert.ok(validScript(s))
})

test('기본 대본의 강조 대상 제목은 모두 사이트 자료에 있다(지어내지 않음)', () => {
  const titles = new Set(['works', 'papers', 'assignments'].flatMap((k) => snapshot[k].map((x) => x.title)))
  for (const sc of buildTemplateScript(snapshot).scenes)
    for (const l of sc.lines) if (l.focus) assert.ok(titles.has(l.focus.title), l.focus.title)
})

test('질문 목록에서 가까운 질문을 찾고, 없으면 null', () => {
  const faq = buildTemplateScript(snapshot).faq
  assert.ok(faq.length > 0 && faq.length <= 10)
  assert.ok(matchFaq('홈페이지에 뭐가 있어요?', faq))
  assert.strictEqual(matchFaq('연봉이 얼마예요', faq), null)
  assert.ok(NOT_ON_SITE.includes('없어요'))
})

test('음성 캐시 키는 목소리와 글자가 같으면 같고, 다르면 다르다', () => {
  assert.strictEqual(cacheKey('v1', '안녕'), cacheKey('v1', '안녕'))
  assert.notStrictEqual(cacheKey('v1', '안녕'), cacheKey('v2', '안녕'))
})

test('LLM 응답에서 JSON만 꺼낸다', () => {
  assert.deepStrictEqual(extractJson('설명\n```json\n{"a":1}\n```'), { a: 1 })
})
