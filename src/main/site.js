// 사이트 조작. 사이트 코드는 건드리지 않고, 실행 중인 페이지에 손 모양 커서·강조 테두리를 덧붙여 그립니다.
// 선택자를 못 찾으면 그 동작만 건너뜁니다(말은 계속).

const CURSOR_MS = 900 // 커서가 날아가는 시간
const SCROLL_SETTLE_MS = 700 // 부드러운 스크롤이 멈출 때까지 기다리는 시간
const VIDEO_MAX_SECONDS = 60 // 영상을 끝까지 틀 때의 상한
const READ_PAUSE_MS = 1200 // 게시글을 연 뒤 제목을 보여 주는 시간
const READ_SCROLL_PX = 1 // 읽어 내려가는 속도: READ_SCROLL_MS 마다 이만큼(약 60px/초)
const READ_SCROLL_MS = 16
const EMBED_SECONDS = 10 // 유튜브 같은 외부 영상은 끝을 알 수 없어 이만큼만 보여 줍니다

// 페이지 안에서 한 번만 설치되는 도우미. window.__avatar 로 씁니다.
const INSTALL = `(() => {
  if (window.__avatar) return true
  const st = document.createElement('style')
  st.textContent = \`
    #__av-cursor{position:fixed;left:0;top:0;width:44px;height:44px;z-index:2147483647;pointer-events:none;
      transition:transform ${CURSOR_MS}ms cubic-bezier(.4,.1,.2,1),opacity .3s;opacity:0;font-size:38px;
      filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))}
    #__av-cursor.press{animation:__avpress .25s}
    @keyframes __avpress{50%{scale:.8}}
    #__av-box{position:absolute;z-index:2147483646;pointer-events:none;border:4px solid #ff5a36;border-radius:14px;
      box-shadow:0 0 0 6px rgba(255,90,54,.18);opacity:0;transition:all .45s ease}\`
  document.head.appendChild(st)
  const cur = document.createElement('div'); cur.id = '__av-cursor'; cur.textContent = '👆'
  const box = document.createElement('div'); box.id = '__av-box'
  document.body.append(cur, box)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim()
  async function moveTo(el) {
    const r = el.getBoundingClientRect()
    cur.style.opacity = 1
    cur.style.transform = 'translate(' + (r.left + r.width / 2 - 12) + 'px,' + (r.top + r.height / 2 - 6) + 'px)'
    await wait(${CURSOR_MS})
  }
  // 화면(창) 기준 위치. 아바타 층이 이 좌표로 걸어갑니다
  function rectOf(el) {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  }
  function frame(el) {
    const r = el.getBoundingClientRect()
    Object.assign(box.style, { left: (r.left + scrollX - 8) + 'px', top: (r.top + scrollY - 8) + 'px',
      width: (r.width + 16) + 'px', height: (r.height + 16) + 'px', opacity: 1 })
  }
  window.__avatar = {
    async menu(label) {
      const el = [...document.querySelectorAll('.nav__link')].find((b) => norm(b.textContent) === label)
      if (!el) return false
      box.style.opacity = 0
      await moveTo(el)
      cur.classList.remove('press'); void cur.offsetWidth; cur.classList.add('press')
      el.click()
      await wait(500)
      return true
    },
    async focus(kind, title) {
      const list = [...document.querySelectorAll(kind === 'card' ? '.card' : '.post')]
      const t = norm(title)
      const el = list.find((e) => norm(e.textContent).includes(t)) ||
        list.find((e) => t.length > 8 && norm(e.textContent).includes(t.slice(0, 8)))
      if (!el) return false
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      await wait(${SCROLL_SETTLE_MS})
      frame(el)
      cur.style.opacity = 0 // 게시글은 아바타가 직접 걸어가 손으로 짚습니다
      return rectOf(el)
    },
    // 카드를 눌러 상세 화면을 열고, 영상을 seconds 초 동안 틀었다가 닫고 목록으로 돌아옵니다
    async showVideo(title, seconds) {
      const t = norm(title)
      const card = [...document.querySelectorAll('.card')].find((e) => norm(e.textContent).includes(t))
      if (!card) return false
      box.style.opacity = 0
      await moveTo(card)
      card.click()
      await wait(1200)
      const v = document.querySelector('.detail__video')
      if (v) {
        v.scrollIntoView({ behavior: 'smooth', block: 'center' })
        await wait(${SCROLL_SETTLE_MS})
        frame(v)
        cur.style.opacity = 0
        if (v.tagName === 'VIDEO') {
          v.currentTime = 0
          try { await v.play() } catch {}
          // seconds 가 0 이면 끝까지(최대 ${VIDEO_MAX_SECONDS}초) 틉니다
          const limit = (seconds > 0 ? seconds : ${VIDEO_MAX_SECONDS}) * 1000
          await Promise.race([wait(limit), new Promise((r) => v.addEventListener('ended', r, { once: true }))])
          v.pause()
        } else {
          await wait((seconds > 0 ? seconds : ${EMBED_SECONDS}) * 1000)
        }
      }
      box.style.opacity = 0
      const back = document.querySelector('.article__back, .detail__close')
      if (back) back.click()
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wait(700)
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
      await wait(${SCROLL_SETTLE_MS})
      return true
    },
    // 게시글을 눌러 열고, 대사가 이어지는 동안 천천히 아래로 내려 읽어 줍니다(closePost 까지)
    async openPost(title) {
      const t = norm(title)
      const el = [...document.querySelectorAll('.post')].find((e) => norm(e.textContent).includes(t))
      if (!el) return false
      await moveTo(el)
      cur.classList.remove('press'); void cur.offsetWidth; cur.classList.add('press')
      box.style.opacity = 0
      el.click()
      await wait(900)
      cur.style.opacity = 0
      scrollTo({ top: 0 })
      clearInterval(window.__avatarScroll)
      await wait(${READ_PAUSE_MS})
      // 사이트의 스크롤 스냅(mandatory)이 조금씩 내린 위치를 되돌리므로, 읽는 동안만 실행 중인 페이지에서 끕니다
      const root = document.documentElement.style
      root.scrollSnapType = 'none'
      root.scrollBehavior = 'auto'
      window.__avatarScroll = setInterval(() => scrollBy(0, ${READ_SCROLL_PX}), ${READ_SCROLL_MS})
      return true
    },
    async closePost() {
      if (!window.__avatarScroll) return false
      clearInterval(window.__avatarScroll)
      window.__avatarScroll = null
      document.documentElement.style.scrollSnapType = ''
      document.documentElement.style.scrollBehavior = ''
      const back = document.querySelector('.article__back')
      if (back) back.click()
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wait(800)
      return true
    },
    menuRect(label) {
      const el = [...document.querySelectorAll('.nav__link')].find((b) => norm(b.textContent) === label)
      return el ? rectOf(el) : null
    },
    clear() { box.style.opacity = 0; cur.style.opacity = 0 },
    top() { box.style.opacity = 0; scrollTo({ top: 0, behavior: 'smooth' }) },
  }
  return true
})()`

function createSiteControl(webContents) {
  // userGesture: 영상 재생처럼 사용자의 클릭이 있어야 허용되는 동작에 씁니다
  async function run(expr, userGesture = false) {
    try {
      await webContents.executeJavaScript(INSTALL)
      return await webContents.executeJavaScript(expr, userGesture)
    } catch (err) {
      console.warn('[site] 조작 실패:', err.message)
      return false
    }
  }
  return {
    menu: (label) => run(`window.__avatar.menu(${JSON.stringify(label)})`),
    openPost: (title) => run(`window.__avatar.openPost(${JSON.stringify(title)})`),
    closePost: () => run('window.__avatar.closePost()'),
    showVideo: (title, seconds) => run(`window.__avatar.showVideo(${JSON.stringify(title)}, ${Number(seconds)})`, true),
    menuRect: (label) => run(`window.__avatar.menuRect(${JSON.stringify(label)})`),
    focus: (kind, title) => run(`window.__avatar.focus(${JSON.stringify(kind)}, ${JSON.stringify(title)})`),
    clear: () => run('window.__avatar.clear()'),
    top: () => run('window.__avatar.top()'),
  }
}

module.exports = { createSiteControl }
