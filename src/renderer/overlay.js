// 투어 진행: 대본을 한 줄씩 말하고, 사이트를 넘기고, 끼어든 직접 질문에 답합니다.

const $ = (id) => document.getElementById(id)
const api = window.avatar

const LINE_GAP_MS = 350
const VIDEO_SECONDS = 6 // 대본에 길이를 적지 않았을 때 영상을 틀어 두는 시간 // 대사 사이 숨 고르기
const FALLBACK_SECONDS_PER_CHAR = 0.13 // 내장 음성의 끝 이벤트가 안 올 때 예상 길이
const SCRIPT_LABEL = { claude: '새로 각색한 대본', cache: '각색 대본', bundled: '동봉 각색 대본', template: '기본 대본' }
const SPEAKER_LABEL = { avatar: '아바타', interviewer: '인터뷰어', visitor: '방문자 질문' }

// 내장 음성일 때 두 인물을 높낮이·속도로 구분합니다(Windows 기본 한국어 음성은 하나뿐)
const SYNTH_VOICE = { avatar: { pitch: 0.85, rate: 1.05 }, interviewer: { pitch: 1.35, rate: 1.12 } }

const VOWEL_MOUTH = ['aa', 'ee', 'aa', 'ee', 'oh', 'ee', 'oh', 'ee', 'oh', 'aa', 'ee', 'ee', 'oh', 'ou', 'oh', 'ee', 'ih', 'ou', 'ih', 'ih', 'ih']
function mouthOf(ch) {
  const c = ch ? ch.charCodeAt(0) : 0
  if (c >= 0xac00 && c <= 0xd7a3) return VOWEL_MOUTH[Math.floor(((c - 0xac00) % 588) / 28)]
  return null
}

let tour = null
// 아바타는 별도 층(창)에 있어, 몸짓은 메인을 거쳐 보냅니다. 입 모양은 바뀔 때만 보냅니다
let lastMouth = null
const avatar = {
  play: (name) => api.body.act('play', name),
  setTalking: (on) => api.body.send('setTalking', on),
  setMouth(shape) {
    shape = shape || null
    if (shape === lastMouth) return
    lastMouth = shape
    api.body.send('setMouth', shape)
  },
}
const run = {
  playing: false,
  paused: false,
  skip: false,
  questions: [],
  current: null, // 지금 말하는 소리: { pause, resume, stop }
  resumeWaiters: [],
}

// ── 자막 ──
function showLine(who, text, shown = 0) {
  $('speaker').textContent = SPEAKER_LABEL[who] || ''
  $('speaker').className = 'speaker ' + who
  const line = $('line')
  line.textContent = ''
  const a = document.createElement('span')
  a.textContent = text.slice(0, shown)
  const b = document.createElement('span')
  b.className = 'rest'
  b.textContent = text.slice(shown)
  line.append(a, b)
}

// ── 말하기: ElevenLabs(글자 타임스탬프) → 안 되면 내장 음성 ──
const speechCache = new Map()
function fetchSpeech(who, text) {
  const key = who + '|' + text
  if (!speechCache.has(key)) speechCache.set(key, api.speak(who, text))
  return speechCache.get(key)
}

async function say(who, text) {
  const res = tour.modes.tts ? await fetchSpeech(who, text) : { ok: false }
  if (who === 'avatar') avatar.setTalking(true)
  try {
    if (res.ok) await playClip(who, text, res)
    else await playSynth(who, text)
  } finally {
    avatar.setTalking(false)
    run.current = null
  }
}

function playClip(who, text, { audio, chars, mouth }) {
  return new Promise((resolve) => {
    const el = new Audio('data:audio/mpeg;base64,' + audio)
    let raf = 0
    const done = () => { cancelAnimationFrame(raf); showLine(who, text, text.length); resolve() }
    const tick = () => {
      const t = el.currentTime
      let n = 0
      while (n < chars.length && chars[n] <= t) n++
      showLine(who, text, n)
      if (who === 'avatar') {
        const seg = mouth.find((m) => m.t0 <= t && t < m.t1)
        avatar.setMouth(seg ? seg.v : null)
      }
      raf = requestAnimationFrame(tick)
    }
    el.onended = done
    el.onerror = done
    run.current = { pause: () => el.pause(), resume: () => el.play(), stop: () => { el.pause(); done() } }
    el.play().then(tick, done)
  })
}

function koreanVoice() {
  return speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('ko'))
}

function playSynth(who, text) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    const v = koreanVoice()
    if (v) u.voice = v
    Object.assign(u, SYNTH_VOICE[who] || SYNTH_VOICE.avatar)
    let shown = 0
    let flap = 0
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearInterval(flap)
      clearTimeout(guard)
      showLine(who, text, text.length)
      resolve()
    }
    // 단어 단위 boundary 이벤트로 자막을 진행하고, 그 사이 입은 글자 모음으로 움직입니다
    u.onboundary = (e) => { shown = Math.max(shown, e.charIndex + (e.charLength || 1)); showLine(who, text, shown) }
    u.onend = finish
    u.onerror = finish
    if (who === 'avatar') {
      let i = 0
      flap = setInterval(() => {
        if (run.paused) return avatar.setMouth(null)
        i = Math.min(text.length - 1, Math.max(i + 1, shown - 3))
        avatar.setMouth(mouthOf(text[i]) || (i % 2 ? 'aa' : null))
      }, 110)
    }
    const guard = setTimeout(finish, (text.length * FALLBACK_SECONDS_PER_CHAR * 2 + 3) * 1000)
    run.current = {
      pause: () => speechSynthesis.pause(),
      resume: () => speechSynthesis.resume(),
      stop: () => { speechSynthesis.cancel(); finish() },
    }
    showLine(who, text, 0)
    speechSynthesis.speak(u)
  })
}

// ── 흐름 제어 ──
function waitIfPaused() {
  if (!run.paused) return Promise.resolve()
  return new Promise((r) => run.resumeWaiters.push(r))
}

function setPaused(p) {
  run.paused = p
  $('pause').textContent = p ? '▶ 이어 보기' : '⏸ 일시정지'
  if (p) run.current?.pause()
  else {
    run.current?.resume()
    run.resumeWaiters.splice(0).forEach((r) => r())
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function answerQuestions() {
  while (run.questions.length) {
    const q = run.questions.shift()
    showLine('visitor', q, q.length)
    setStatus('답을 생각하는 중…')
    await sleep(900)
    const res = await api.ask(q)
    setStatus(modeText())
    await say('avatar', res.text)
    await sleep(LINE_GAP_MS)
  }
}

async function playLine(line) {
  const tasks = []
  // 게시글을 소개하는 줄: 화면을 그 글로 옮기고, 아바타가 옆으로 걸어가 손을 뻗어 짚습니다
  if (line.focus) {
    tasks.push(api.site.focus(line.focus.kind, line.focus.title).then((rect) => rect && api.body.goTo(rect)))
  } else if (line.who === 'avatar' && line.act && line.act !== 'bow') {
    tasks.push(avatar.play(line.act))
  }
  if (line.act === 'bow') {
    await say(line.who, line.text)
    await avatar.play('bow')
    return
  }
  await Promise.all([say(line.who, line.text), ...tasks])
  // 영상 보여 주기: 아바타는 비켜서고, 카드를 눌러 영상을 잠깐 틀었다가 닫습니다
  if (line.video) {
    await api.body.home()
    await api.site.showVideo(line.video.title, line.video.seconds || VIDEO_SECONDS)
  }
}

async function playTour() {
  run.playing = true
  $('replay').hidden = true
  await api.site.top()
  await api.body.home()
  await avatar.play('walkIn')
  let started = !tour.startScene
  for (const scene of tour.script.scenes) {
    if (!started && scene.id !== tour.startScene) continue
    started = true
    run.skip = false
    if (scene.page) {
      // 메뉴 아래로 걸어가 위를 가리킨 뒤, 손 모양 커서가 메뉴를 누릅니다
      await api.body.goTo(await api.site.menuRect(scene.page), 'up')
      await api.site.menu(scene.page)
    } else if (scene !== tour.script.scenes[0]) {
      await api.body.home() // 마무리 인사는 제자리(오른쪽 아래)로 돌아와서
    }
    for (let i = 0; i < scene.lines.length && !run.skip; i++) {
      // 다음 줄 음성을 미리 받아 둡니다(대사 사이 끊김 줄이기)
      const next = scene.lines[i + 1]
      if (next && tour.modes.tts) fetchSpeech(next.who, next.text)
      await waitIfPaused()
      await playLine(scene.lines[i])
      await answerQuestions()
      await sleep(LINE_GAP_MS)
    }
  }
  run.playing = false
  $('replay').hidden = false
  setStatus(modeText() + ' · 질문은 계속 받을 수 있어요')
}

// ── 조작 ──
function setStatus(t) { $('status').textContent = t }
function modeText() {
  const m = tour.modes
  return [
    SCRIPT_LABEL[tour.script.source] || '각색 대본',
    m.llm ? 'Claude 답변' : '질문 목록 답변',
    m.tts ? 'ElevenLabs 음성' : '내장 음성',
    tour.dataSource === 'live' ? '실시간 자료' : '동봉 자료',
  ].join(' · ')
}

function bindControls() {
  $('pause').onclick = () => run.playing && setPaused(!run.paused)
  $('skip').onclick = () => {
    if (!run.playing) return
    run.skip = true
    if (run.paused) setPaused(false)
    run.current?.stop()
  }
  $('replay').onclick = () => playTour()
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement !== $('question')) { e.preventDefault(); $('pause').click() }
  })
  $('ask').onsubmit = async (e) => {
    e.preventDefault()
    const q = $('question').value.trim()
    if (!q) return
    $('question').value = ''
    run.questions.push(q)
    if (!run.playing) await answerQuestions() // 투어가 끝난 뒤엔 바로 답합니다
    else setStatus('질문을 받았어요. 지금 문장을 마치고 답할게요.')
  }
  if (tour.modes.stt) bindMic()
}

function bindMic() {
  const mic = $('mic')
  mic.hidden = false
  let rec = null
  mic.onclick = async () => {
    if (rec) return rec.stop()
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { return setStatus('마이크를 쓸 수 없어요. 글자로 물어봐 주세요.') }
    const chunks = []
    rec = new MediaRecorder(stream)
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      mic.classList.remove('recording')
      rec = null
      setStatus('질문을 알아듣는 중…')
      const blob = new Blob(chunks, { type: 'audio/webm' })
      const res = await api.transcribe(await blob.arrayBuffer(), blob.type)
      setStatus(modeText())
      if (res.ok && res.text) { $('question').value = res.text; $('ask').requestSubmit() }
      else setStatus('잘 못 알아들었어요. 글자로 물어봐 주세요.')
    }
    rec.start()
    mic.classList.add('recording')
    setStatus('듣고 있어요… 다 말했으면 🎤를 한 번 더 누르세요.')
  }
}

async function main() {
  speechSynthesis.getVoices() // 목록을 미리 깨웁니다(처음엔 비어 있을 수 있음)
  tour = await api.loadTour()
  setStatus(modeText())
  bindControls()
  await api.site.ready()
  await sleep(1200)
  playTour()
}

main().catch((err) => setStatus('오류: ' + err.message))
