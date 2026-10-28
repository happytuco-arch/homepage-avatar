// 3D 아바타. assets/avatar.vrm 이 있으면 VRM을, 없으면 코드로 그린 정장 인물을 씁니다.
// 동작(걷기·손 흔들기·가리키기·90도 인사)은 모두 코드로 만듭니다.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'

const WALK_IN_SECONDS = 2.4
const WALK_START_X = 2.6
const BOW_ANGLE = Math.PI / 2 // 90도 인사
const BOW_SECONDS = 1.1
const BOW_HOLD_SECONDS = 1.2
const CAMERA_FOV = 31
const CAMERA_Y = 1.2 // 발끝(0)부터 든 팔 끝(약 2.4)까지의 가운데
const POINT_TURN = 0.45 // 짚을 때 몸을 트는 각도
const POINT_ARM_SIDE = Math.PI / 2 // 옆으로 팔을 수평으로 뻗기
const POINT_ARM_UP = 2.6 // 위(메뉴)를 가리키기
const BOW_TURN = 0.7 // 인사할 때 몸을 돌리는 각도(정면에서는 숙인 각도가 안 보임)
const MOUTH_SHAPES = ['aa', 'ih', 'ou', 'ee', 'oh']

// 코드 인물의 입 모양 (가로, 세로 배율)
const MOUTH_SCALE = { aa: [1, 1], ih: [1.15, 0.35], ou: [0.55, 0.75], ee: [1.25, 0.5], oh: [0.75, 0.95], null: [0.9, 0.12] }

const COLORS = { suit: 0x1f2a44, shirt: 0xf5f5f2, tie: 0xb3262d, skin: 0xf1c7a5, hair: 0x22201f, shoe: 0x111111, mouth: 0x7a2b2b }

function box(w, h, d, color, y = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }))
  m.position.y = y
  return m
}

function sphere(r, color) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
}

/** 코드로 그린 정장 인물. 관절(group)을 돌려 동작을 만듭니다. */
function buildFigure() {
  const root = new THREE.Group()
  const hipY = 0.92

  const legs = [-0.12, 0.12].map((x) => {
    const g = new THREE.Group()
    g.position.set(x, hipY, 0)
    g.add(box(0.17, 0.88, 0.2, COLORS.suit, -0.44))
    const shoe = box(0.18, 0.08, 0.3, COLORS.shoe, -0.9)
    shoe.position.z = 0.05
    g.add(shoe)
    root.add(g)
    return g
  })

  const upper = new THREE.Group() // 허리 관절: 인사할 때 이 관절을 굽힙니다
  upper.position.y = hipY
  root.add(upper)
  upper.add(box(0.52, 0.64, 0.28, COLORS.suit, 0.32))
  const shirt = box(0.16, 0.42, 0.01, COLORS.shirt, 0.43)
  shirt.position.z = 0.142
  const tie = box(0.06, 0.36, 0.012, COLORS.tie, 0.4)
  tie.position.z = 0.15
  upper.add(shirt, tie)

  const arms = [-0.33, 0.33].map((x) => {
    const g = new THREE.Group()
    g.position.set(x, 0.6, 0)
    g.add(box(0.14, 0.62, 0.16, COLORS.suit, -0.31))
    const hand = sphere(0.07, COLORS.skin)
    hand.position.y = -0.66
    g.add(hand)
    upper.add(g)
    return g
  })

  const head = new THREE.Group()
  head.position.y = 0.68
  upper.add(head)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 16), new THREE.MeshStandardMaterial({ color: COLORS.skin }))
  head.add(neck)
  const face = sphere(0.17, COLORS.skin)
  face.position.y = 0.2
  face.scale.set(1, 1.12, 1)
  head.add(face)
  const hair = sphere(0.178, COLORS.hair)
  hair.position.set(0, 0.25, -0.015)
  hair.scale.set(1.03, 0.95, 1.02)
  // 앞머리가 얼굴을 덮지 않게 앞쪽 아래를 잘라 낸 반구 모양
  hair.geometry = new THREE.SphereGeometry(0.178, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.42)
  head.add(hair)
  const eyes = [-0.06, 0.06].map((x) => {
    const e = sphere(0.022, 0x1b1b1b)
    e.position.set(x, 0.23, 0.155)
    head.add(e)
    return e
  })
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), new THREE.MeshStandardMaterial({ color: COLORS.mouth }))
  mouth.position.set(0, 0.115, 0.168)
  head.add(mouth)

  return { root, legs, arms, upper, head, eyes, mouth }
}

export async function createAvatar(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  // 머리 위로 팔을 든 모습(메뉴 가리키기)까지 잘리지 않게 위쪽 여유를 두고 잡습니다
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50)
  camera.position.set(0, CAMERA_Y, 4.6)
  camera.lookAt(0, CAMERA_Y, 0)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(1.5, 3, 4)
  scene.add(sun)

  const body = await loadVrm(scene).catch(() => null)
  const fig = body ? null : buildFigure()
  if (fig) scene.add(fig.root)
  const root = body ? body.scene : fig.root

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  new ResizeObserver(resize).observe(canvas)

  // ── 동작 상태 ──
  let act = { name: 'hidden', t: 0, resolve: null }
  let walkDir = 0 // -1 왼쪽, 1 오른쪽으로 걷는 중, 0 멈춤
  let walkT = 0
  let mouthShape = null
  let mouthOpen = 0
  let talking = false
  let blinkIn = 2
  root.visible = false

  function play(name) {
    return new Promise((resolve) => {
      if (act.resolve) act.resolve()
      act = { name, t: 0, resolve }
      root.visible = true
      if (name === 'wave' || name === 'point' || name === 'idle') setTimeout(() => finish(name), name === 'idle' ? 0 : 1800)
    })
  }
  function finish(name) {
    if (act.name !== name) return
    const r = act.resolve
    act = { name: 'idle', t: 0, resolve: null }
    r && r()
  }

  // 관절 값: 코드 인물과 VRM이 같은 값을 받습니다
  const pose = { x: 0, yaw: 0, bow: 0, legSwing: 0, armL: 0, armR: 0, armSwing: 0, nod: 0 }

  function updatePose(dt) {
    act.t += dt
    const t = act.t
    pose.legSwing = 0; pose.armSwing = 0; pose.armL = 0; pose.armR = 0; pose.nod = 0
    // 창(아바타 층)이 화면 위를 옮겨 다니는 동안: 그 방향을 보고 걷습니다
    if (walkDir) {
      walkT += dt
      pose.yaw += ((walkDir > 0 ? Math.PI / 2 : -Math.PI / 2) - pose.yaw) * Math.min(1, dt * 10)
      pose.bow = 0
      pose.legSwing = Math.sin(walkT * 9) * 0.5
      pose.armSwing = pose.legSwing * 0.8
      return
    }
    switch (act.name) {
      case 'pointSide': {
        // 게시글 쪽으로 몸을 살짝 틀고 팔을 뻗어 짚습니다(다른 동작이 올 때까지 유지)
        const k = Math.min(1, t * 4)
        const turn = act.side === 'left' ? -POINT_TURN : act.side === 'right' ? POINT_TURN : 0
        pose.yaw += (turn - pose.yaw) * Math.min(1, dt * 8)
        if (act.side === 'left') pose.armL = POINT_ARM_SIDE * k
        else if (act.side === 'right') pose.armR = POINT_ARM_SIDE * k
        else pose.armL = POINT_ARM_UP * k
        break
      }
      case 'walkIn': {
        const k = Math.min(1, t / WALK_IN_SECONDS)
        pose.x = WALK_START_X * (1 - k)
        pose.yaw = k < 0.85 ? -Math.PI / 2 : -Math.PI / 2 * (1 - (k - 0.85) / 0.15)
        pose.legSwing = k < 0.9 ? Math.sin(t * 9) * 0.5 : 0
        pose.armSwing = pose.legSwing * 0.8
        if (k >= 1) finish('walkIn')
        break
      }
      case 'wave':
        pose.armR = 2.6 + Math.sin(t * 10) * 0.25
        break
      case 'point':
        pose.armL = 2.2
        break
      case 'bow': {
        const total = BOW_SECONDS * 2 + BOW_HOLD_SECONDS
        const k = t < BOW_SECONDS ? t / BOW_SECONDS : t < BOW_SECONDS + BOW_HOLD_SECONDS ? 1 : Math.max(0, 1 - (t - BOW_SECONDS - BOW_HOLD_SECONDS) / BOW_SECONDS)
        pose.bow = BOW_ANGLE * (0.5 - Math.cos(Math.PI * k) / 2)
        pose.yaw = -BOW_TURN * Math.min(1, t * 2) * (t < total - 0.5 ? 1 : Math.max(0, (total - t) * 2)) // 옆으로 살짝 돌아 90도가 보이게
        if (t >= total) finish('bow')
        break
      }
      default:
        pose.yaw += (0 - pose.yaw) * Math.min(1, dt * 8) // 정면으로 천천히 돌아섭니다
        pose.bow = 0
    }
    if (talking) pose.nod = Math.sin(performance.now() / 260) * 0.035
  }

  function applyFigure(time) {
    fig.root.position.x = pose.x
    fig.root.rotation.y = pose.yaw
    fig.upper.rotation.x = pose.bow
    fig.legs[0].rotation.x = pose.legSwing
    fig.legs[1].rotation.x = -pose.legSwing
    fig.arms[0].rotation.x = -pose.armSwing
    fig.arms[1].rotation.x = pose.armSwing
    fig.arms[0].rotation.z = -pose.armL - 0.06
    fig.arms[1].rotation.z = pose.armR + 0.06
    fig.head.rotation.x = pose.nod
    fig.upper.position.y = 0.92 + Math.sin(time / 600) * 0.004 // 숨쉬기
    const [sx, sy] = MOUTH_SCALE[mouthOpen > 0.15 ? mouthShape : 'null'] || MOUTH_SCALE.null
    fig.mouth.scale.set(sx, 0.12 + (sy - 0.12) * Math.min(1, mouthOpen), 1)
    const blink = blinkIn < 0.12 ? 0.15 : 1
    fig.eyes.forEach((e) => (e.scale.y = blink))
  }

  function applyVrm() {
    const h = body.vrm.humanoid
    const bone = (n) => h.getNormalizedBoneNode(n)
    body.scene.position.x = pose.x
    body.scene.rotation.y = pose.yaw
    bone('spine') && (bone('spine').rotation.x = pose.bow * 0.45)
    bone('chest') && (bone('chest').rotation.x = pose.bow * 0.35)
    bone('upperChest') && (bone('upperChest').rotation.x = pose.bow * 0.2)
    bone('leftUpperLeg') && (bone('leftUpperLeg').rotation.x = pose.legSwing)
    bone('rightUpperLeg') && (bone('rightUpperLeg').rotation.x = -pose.legSwing)
    bone('leftUpperArm') && (bone('leftUpperArm').rotation.z = -1.25 + pose.armR)
    bone('rightUpperArm') && (bone('rightUpperArm').rotation.z = 1.25 - pose.armL)
    bone('head') && (bone('head').rotation.x = pose.nod)
    const em = body.vrm.expressionManager
    if (em) {
      for (const s of MOUTH_SHAPES) em.setValue(s, s === mouthShape ? Math.min(1, mouthOpen) : 0)
      em.setValue('blink', blinkIn < 0.12 ? 1 : 0)
    }
  }

  const clock = new THREE.Clock()
  renderer.setAnimationLoop((time) => {
    const dt = Math.min(0.05, clock.getDelta())
    blinkIn -= dt
    if (blinkIn < 0) blinkIn = 2.5 + Math.random() * 2.5
    // 입은 목표 값으로 부드럽게 따라갑니다
    mouthOpen += ((mouthShape ? 1 : 0) - mouthOpen) * Math.min(1, dt * 22)
    updatePose(dt)
    if (fig) applyFigure(time)
    else { applyVrm(); body.vrm.update(dt) }
    renderer.render(scene, camera)
  })

  return {
    kind: body ? 'vrm' : 'figure',
    play,
    setWalk(dir) { walkDir = dir; root.visible = true },
    point(side) {
      if (act.resolve) act.resolve()
      act = side === 'none' ? { name: 'idle', t: 0, resolve: null } : { name: 'pointSide', t: 0, resolve: null, side }
    },
    setMouth(shape) { mouthShape = shape || null },
    setTalking(on) { talking = on; if (!on) mouthShape = null },
  }
}

async function loadVrm(scene) {
  // file:// 에서는 fetch가 막혀 있어 메인 프로세스가 파일을 읽어 넘겨 줍니다
  const buf = await window.avatar.vrm()
  if (!buf) throw new Error('VRM 없음')
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.parseAsync(buf, '')
  const vrm = gltf.userData.vrm
  VRMUtils.rotateVRM0(vrm)
  scene.add(vrm.scene)
  return { vrm, scene: vrm.scene }
}
