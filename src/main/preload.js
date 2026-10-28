// 투어 띠(overlay)와 아바타 층에 붙는 다리. 키는 넘기지 않고, 필요한 호출만 엽니다.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('avatar', {
  vrm: () => ipcRenderer.invoke('asset:vrm'),
  loadTour: () => ipcRenderer.invoke('tour:load'),
  speak: (who, text) => ipcRenderer.invoke('tts:speak', who, text),
  ask: (question) => ipcRenderer.invoke('qa:ask', question),
  transcribe: (audio, mime) => ipcRenderer.invoke('stt:transcribe', audio, mime),
  site: {
    ready: () => ipcRenderer.invoke('site:ready'),
    menu: (label) => ipcRenderer.invoke('site:menu', label),
    menuRect: (label) => ipcRenderer.invoke('site:menuRect', label),
    focus: (kind, title) => ipcRenderer.invoke('site:focus', kind, title),
    clear: () => ipcRenderer.invoke('site:clear'),
    top: () => ipcRenderer.invoke('site:top'),
  },

  // 투어 띠 → 아바타: 몸짓(끝날 때까지 기다림)·입 모양(보내고 끝)·걸어가서 짚기·제자리로
  body: {
    act: (name, ...args) => ipcRenderer.invoke('avatar:act', name, args),
    send: (name, ...args) => ipcRenderer.send('avatar:send', name, args),
    goTo: (rect, side) => ipcRenderer.invoke('avatar:goTo', rect, side),
    home: () => ipcRenderer.invoke('avatar:home'),
  },

  // 아바타 층 쪽에서 쓰는 것
  onCommand: (cb) => ipcRenderer.on('avatar:command', (_e, msg) => cb(msg)),
  done: (id) => ipcRenderer.send('avatar:done', id),
  ready: () => ipcRenderer.send('avatar:ready'),
})
