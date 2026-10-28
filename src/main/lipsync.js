// 글자 → 입 모양. VRM 기본 모음 표정 다섯 개(aa·ih·ou·ee·oh)만 씁니다.

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const SYLLABLES_PER_VOWEL_BLOCK = 588 // 중성 하나당 (종성 28 × 초성 아님) 묶음 크기
const FINALS = 28

// 중성 21개 순서: ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ
const VOWEL_TO_MOUTH = [
  'aa', 'ee', 'aa', 'ee', 'oh', 'ee', 'oh', 'ee', 'oh', 'aa', 'ee',
  'ee', 'oh', 'ou', 'oh', 'ee', 'ih', 'ou', 'ih', 'ih', 'ih',
]

const LATIN = { a: 'aa', e: 'ee', i: 'ih', o: 'oh', u: 'ou', y: 'ih' }

/** 글자 하나의 입 모양. 모음이 없으면(공백·문장부호·자음) null = 입 닫음 */
function mouthOf(ch) {
  if (!ch) return null
  const c = ch.charCodeAt(0)
  if (c >= HANGUL_START && c <= HANGUL_END) {
    const vowel = Math.floor(((c - HANGUL_START) % SYLLABLES_PER_VOWEL_BLOCK) / FINALS)
    return VOWEL_TO_MOUTH[vowel]
  }
  return LATIN[ch.toLowerCase()] || null
}

/**
 * ElevenLabs alignment → 입 모양 구간 목록 [{ t0, t1, v }].
 * 같은 모양이 이어지면 한 구간으로 합칩니다.
 */
function mouthTimeline(alignment) {
  if (!alignment || !Array.isArray(alignment.characters)) return []
  const { characters, character_start_times_seconds: s, character_end_times_seconds: e } = alignment
  const out = []
  for (let i = 0; i < characters.length; i++) {
    const v = mouthOf(characters[i])
    if (!v) continue
    const last = out[out.length - 1]
    if (last && last.v === v && Math.abs(last.t1 - s[i]) < 0.01) last.t1 = e[i]
    else out.push({ t0: s[i], t1: e[i], v })
  }
  return out
}

module.exports = { mouthOf, mouthTimeline }
