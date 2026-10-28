// 사이트 자료 읽기. Supabase 공개 읽기(RLS select 허용) → 실패하면 동봉 스냅숏.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SNAPSHOT = path.join(__dirname, '..', '..', 'assets', 'site-snapshot.json')
const FETCH_TIMEOUT_MS = 8000
const TEXT_LIMIT = 700 // 한 칸에서 LLM에 넘길 최대 글자 수

const TABLES = {
  works: { table: 'projects', select: 'title,description,link_url,created_at' },
  papers: { table: 'papers', select: 'title,authors,venue,year,summary,abstract,takeaways,keywords,created_at' },
  assignments: { table: 'assignments', select: 'title,course,week,prompt,note,result_url,created_at' },
}

function trimRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (v == null || v === '' || k === 'created_at') continue
    out[k] = typeof v === 'string' && v.length > TEXT_LIMIT ? v.slice(0, TEXT_LIMIT) + '…' : v
  }
  return out
}

async function fetchTable(url, key, { table, select }) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${select}&order=created_at.desc`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${table} ${res.status}`)
  return (await res.json()).map(trimRow)
}

async function fetchLive(url, key) {
  const data = {}
  for (const [name, spec] of Object.entries(TABLES)) data[name] = await fetchTable(url, key, spec)
  return data
}

function readSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
}

/** { data, source: 'live' | 'snapshot' } */
async function loadSiteData({ supabaseUrl, supabaseKey }) {
  if (supabaseUrl && supabaseKey) {
    try {
      return { data: await fetchLive(supabaseUrl, supabaseKey), source: 'live' }
    } catch (err) {
      console.warn('[siteData] 실시간 읽기 실패, 스냅숏 사용:', err.message)
    }
  }
  return { data: readSnapshot(), source: 'snapshot' }
}

function hashData(data) {
  return crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 12)
}

module.exports = { loadSiteData, fetchLive, hashData, SNAPSHOT }
