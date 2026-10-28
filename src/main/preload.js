// 아바타 띠(오버레이)에만 붙는 다리. 키는 넘기지 않고, 필요한 호출만 엽니다.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('avatar', {
  vrm: () => ipcRenderer.invoke('asset:vrm'),
  loadTour:() => ipcRenderer.invoke('tour:load'),
  speak: (who, text) => ipcRenderer.invoke('tts:speak', who, text),
  ask: (question) => ipcRenderer.invoke('qa:ask', question),
  transcribe: (audio, mime) => ipcRenderer.invoke('stt:transcribe', audio, mime),
  site: {
    ready: () => ipcRenderer.invoke('site:ready'),
    menu: (label) => ipcRenderer.invoke('site:menu', label),
    focus: (kind, title) => ipcRenderer.invoke('site:focus', kind, title),
    clear: () => ipcRenderer.invoke('site:clear'),
    top: () => ipcRenderer.invoke('site:top'),
  },
})
