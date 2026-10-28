// 아바타 층. 메인 프로세스가 이 작은 창을 화면 위로 옮기고, 여기서는 몸짓만 그립니다.
// 명령은 투어 띠(overlay)에서 메인을 거쳐 들어옵니다.
import { createAvatar } from './avatar3d.js'

const avatar = await createAvatar(document.getElementById('avatar'))

window.avatar.onCommand(async ({ id, name, args }) => {
  if (name === 'play') await avatar.play(...args)
  else if (typeof avatar[name] === 'function') avatar[name](...args)
  if (id) window.avatar.done(id)
})
window.avatar.ready()
