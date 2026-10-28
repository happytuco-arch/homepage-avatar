// 개발용 녹화: AVATAR_RECORD=파일.mp4 를 주면 앱 창(화면 + 컴퓨터 소리)을 녹화해 저장하고 앱을 닫습니다.
//   AVATAR_RECORD_SECONDS  녹화 길이(기본 30초) · AVATAR_RECORD_DELAY  시작 전 기다릴 초(기본 3초)
// 과제 제출용 30초 시연 영상을 만들 때 씁니다.
const fs = require('fs')
const { app, desktopCapturer, session } = require('electron')

const DEFAULT_SECONDS = 30
const DEFAULT_DELAY = 3
const WINDOW_TITLE = 'Homepage Avatar'

function startRecording(win, recorderView, file) {
  const seconds = Number(process.env.AVATAR_RECORD_SECONDS) || DEFAULT_SECONDS
  const delay = Number(process.env.AVATAR_RECORD_DELAY) || DEFAULT_DELAY

  // 화면 공유 요청이 오면 이 앱 창과 컴퓨터 소리(loopback)를 넘깁니다
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['window'] })
    const mine = sources.find((s) => s.name === WINDOW_TITLE) || sources[0]
    callback({ video: mine, audio: 'loopback' })
  })

  setTimeout(async () => {
    console.log(`[녹화] 시작 ${seconds}초 → ${file}`)
    try {
      const base64 = await recorderView.webContents.executeJavaScript(`(async () => { try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
        const type = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
        if (!type) throw new Error('mp4 녹화를 지원하지 않습니다')
        const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6000000 })
        const chunks = []
        rec.ondataavailable = (e) => chunks.push(e.data)
        const done = new Promise((r) => (rec.onstop = r))
        rec.start(1000)
        await new Promise((r) => setTimeout(r, ${seconds * 1000}))
        rec.stop()
        await done
        stream.getTracks().forEach((t) => t.stop())
        const buf = await new Blob(chunks, { type }).arrayBuffer()
        let s = ''
        const bytes = new Uint8Array(buf)
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return btoa(s)
      } catch (e) { return 'ERR ' + e.name + ': ' + e.message } })()`, true)
      if (base64.startsWith('ERR ')) throw new Error(base64.slice(4))
      fs.writeFileSync(file, Buffer.from(base64, 'base64'))
      console.log(`[녹화] 저장 ${Math.round(fs.statSync(file).size / 1024)}KB`)
    } catch (err) {
      console.warn('[녹화] 실패:', err.message)
    }
    app.quit()
  }, delay * 1000)
}

module.exports = { startRecording }
