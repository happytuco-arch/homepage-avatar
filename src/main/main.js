// 앱 시작점. 창 하나에 두 겹: 아래는 실제 사이트, 위는 투명 아바타 띠.
const fs = require('fs')
const path = require('path')
const { app, BaseWindow, WebContentsView, ipcMain, session } = require('electron')
const { loadConfig } = require('./config')
const { loadSiteData } = require('./siteData')
const { getScript, answer } = require('./llm')
const { synthesize, transcribe } = require('./voice')
const { createSiteControl } = require('./site')

const WINDOW_W = 1280
const WINDOW_H = 820
const OVERLAY_H = 300 // 아바타·자막·조작 버튼이 들어가는 아래쪽 띠 높이

let cfg
let state = { data: null, script: null }

function createWindow() {
  const win = new BaseWindow({ width: WINDOW_W, height: WINDOW_H, title: 'Homepage Avatar', backgroundColor: '#ffffff' })

  // 사이트 뷰: preload 없음(사이트에 아무 권한도 열지 않음)
  const site = new WebContentsView()
  site.webContents.loadURL(cfg.siteUrl)

  const overlay = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })
  overlay.setBackgroundColor('#00000000')
  overlay.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'))

  win.contentView.addChildView(site)
  win.contentView.addChildView(overlay)

  const layout = () => {
    const { width, height } = win.getContentBounds()
    site.setBounds({ x: 0, y: 0, width, height })
    overlay.setBounds({ x: 0, y: height - OVERLAY_H, width, height: OVERLAY_H })
  }
  layout()
  win.on('resize', layout)

  const control = createSiteControl(site.webContents)
  ipcMain.handle('site:menu', (_e, label) => control.menu(label))
  ipcMain.handle('site:focus', (_e, kind, title) => control.focus(kind, title))
  ipcMain.handle('site:clear', () => control.clear())
  ipcMain.handle('site:top', () => control.top())
  ipcMain.handle('site:ready', () => new Promise((resolve) => {
    if (!site.webContents.isLoading()) return resolve(true)
    site.webContents.once('did-finish-load', () => resolve(true))
  }))

  if (process.env.AVATAR_DEVTOOLS) overlay.webContents.openDevTools({ mode: 'detach' })
  overlay.webContents.on('console-message', (e) => {
    console.log('[overlay]', e.message)
    if (process.env.AVATAR_LOG) fs.appendFileSync(process.env.AVATAR_LOG, e.message + '\n')
  })
  if (process.env.AVATAR_SHOT) captureLoop(process.env.AVATAR_SHOT, site, overlay)
}

// 개발용: AVATAR_SHOT=폴더 를 주면 몇 초마다 두 겹을 캡처합니다(동작 확인용)
const SHOT_EVERY_MS = 5000
const SHOT_COUNT = 120
function captureLoop(dir, site, overlay) {
  fs.mkdirSync(dir, { recursive: true })
  let n = 0
  const timer = setInterval(async () => {
    n++
    const tag = String(n).padStart(2, '0')
    fs.writeFileSync(path.join(dir, `${tag}-site.png`), (await site.webContents.capturePage()).toPNG())
    fs.writeFileSync(path.join(dir, `${tag}-overlay.png`), (await overlay.webContents.capturePage()).toPNG())
    if (n === 6) overlay.webContents.executeJavaScript(`console.log('LAYOUT', JSON.stringify([...document.querySelectorAll('.subtitle, .subtitle > *, body')].map(e => [e.className || e.tagName, Math.round(e.getBoundingClientRect().top), Math.round(e.getBoundingClientRect().height)])))`)
    // AVATAR_ASK=질문 을 주면 40초쯤에 직접 질문을 넣어 끼어들기를 확인합니다
    if (n === 8 && process.env.AVATAR_ASK) {
      overlay.webContents.executeJavaScript(`document.getElementById('question').value = ${JSON.stringify(process.env.AVATAR_ASK)}; document.getElementById('ask').requestSubmit()`)
    }
    if (n >= SHOT_COUNT) clearInterval(timer)
  }, SHOT_EVERY_MS)
}

function registerServices() {
  const cacheDir = path.join(app.getPath('userData'), 'audio-cache')

  ipcMain.handle('asset:vrm', () => {
    const file = path.join(__dirname, '..', '..', 'assets', 'avatar.vrm')
    return fs.existsSync(file) ? fs.readFileSync(file) : null
  })

  ipcMain.handle('tour:load', async () => {
    const { data, source } = await loadSiteData(cfg)
    const script = await getScript({ cfg, data, cacheDir })
    state = { data, script }
    return {
      script,
      dataSource: source,
      modes: { llm: !!cfg.anthropicKey, tts: !!cfg.elevenKey, stt: !!cfg.elevenKey },
    }
  })

  ipcMain.handle('tts:speak', async (_e, who, text) => {
    if (!cfg.elevenKey) return { ok: false }
    try {
      const voiceId = who === 'interviewer' ? cfg.voiceInterviewer : cfg.voiceAvatar
      return { ok: true, ...(await synthesize({ key: cfg.elevenKey, voiceId, text, cacheDir })) }
    } catch (err) {
      console.warn('[tts] 실패, 내장 음성 사용:', err.message)
      return { ok: false }
    }
  })

  ipcMain.handle('qa:ask', (_e, question) =>
    answer({ cfg, data: state.data, faq: state.script?.faq || [], question }))

  ipcMain.handle('stt:transcribe', async (_e, audio, mime) => {
    if (!cfg.elevenKey) return { ok: false }
    try {
      return { ok: true, text: await transcribe({ key: cfg.elevenKey, audio: Buffer.from(audio), mime }) }
    } catch (err) {
      console.warn('[stt] 실패:', err.message)
      return { ok: false }
    }
  })
}

app.whenReady().then(() => {
  cfg = loadConfig(app)
  console.log(`[config] .env: ${cfg.envFile || '없음'} · Claude ${cfg.anthropicKey ? '있음' : '없음'} · ElevenLabs ${cfg.elevenKey ? '있음' : '없음'}`)
  // 마이크(직접 질문을 말로 받기)만 허용합니다.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
  registerServices()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
