// 무대: 아바타 층(작은 투명 창)을 사이트 위로 옮겨 다니게 합니다.
// 창을 옮기는 동안 아바타는 그 방향으로 걷고, 도착하면 게시글 쪽으로 팔을 뻗어 짚습니다.
const { ipcMain } = require('electron')

const AV_W = 300 // 아바타 층 크기. 옆으로 뻗은 팔과 머리 위로 든 팔이 들어가는 크기(인물은 가운데)
const AV_H = 360
const WALK_SPEED = 520 // 화면 위를 걷는 속도(px/초)
const MIN_WALK_MS = 350
const FRAME_MS = 16
const NAV_H = 72 // 사이트 위쪽 메뉴 띠 높이. 아바타는 이 아래로만 다닙니다
const SHOULDER = 0.37 // 아바타 층 위에서부터 어깨(팔 뻗는 높이)까지의 비율
const HOME_MARGIN = 10

function createStage(win, view) {
  let pos = null
  let atHome = true
  let seq = 0
  const pending = new Map()

  ipcMain.on('avatar:done', (_e, id) => {
    pending.get(id)?.()
    pending.delete(id)
  })

  const size = () => win.getContentBounds()
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  function place(p) {
    pos = p
    view.setBounds({ x: Math.round(p.x), y: Math.round(p.y), width: AV_W, height: AV_H })
  }

  function homeSpot() {
    const { width, height } = size()
    return { x: width - AV_W - HOME_MARGIN, y: height - AV_H }
  }

  /** 아바타 층에 명령. wait 이면 동작이 끝날 때까지 기다립니다 */
  function command(name, args = [], wait = false) {
    const id = wait ? ++seq : 0
    view.webContents.send('avatar:command', { id, name, args })
    if (wait) return new Promise((resolve) => pending.set(id, resolve))
  }

  async function walkTo(target) {
    const from = { ...pos }
    const dx = target.x - from.x
    const dy = target.y - from.y
    const dist = Math.hypot(dx, dy)
    if (dist < 8) return place(target)
    const ms = Math.max(MIN_WALK_MS, (dist / WALK_SPEED) * 1000)
    command('point', ['none']) // 뻗었던 팔을 내리고
    command('setWalk', [dx >= 0 ? 1 : -1])
    const t0 = Date.now()
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / ms)
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        place({ x: from.x + dx * e, y: from.y + dy * e })
        if (k >= 1) { clearInterval(timer); resolve() }
      }, FRAME_MS)
    })
    command('setWalk', [0])
  }

  /**
   * 게시글(rect) 옆으로 걸어가 그쪽을 짚습니다. side 'up' 은 위쪽 메뉴를 가리킬 때.
   * 오른쪽에 자리가 있으면 게시글 오른쪽에 서서 왼팔로, 없으면 왼쪽에 서서 오른팔로 짚습니다.
   */
  async function goTo(rect, side) {
    if (!rect) return
    const { width, height } = size()
    let target
    let arm
    if (side === 'up') {
      target = { x: rect.x + rect.width / 2 - AV_W * 0.35, y: NAV_H }
      arm = 'up'
    } else {
      const roomRight = rect.x + rect.width + AV_W * 0.6 < width
      target = {
        x: roomRight ? rect.x + rect.width - AV_W * 0.25 : rect.x - AV_W * 0.75,
        y: rect.y + Math.min(rect.height, 260) / 2 - AV_H * SHOULDER,
      }
      arm = roomRight ? 'left' : 'right'
    }
    target.x = clamp(target.x, 0, width - AV_W)
    target.y = clamp(target.y, NAV_H, height - AV_H)
    atHome = false
    await walkTo(target)
    command('point', [arm])
  }

  async function home() {
    atHome = true
    await walkTo(homeSpot())
    command('point', ['none'])
  }

  function relayout() {
    if (!pos || atHome) place(homeSpot())
  }

  return { goTo, home, relayout, command, size: { width: AV_W, height: AV_H } }
}

module.exports = { createStage }
