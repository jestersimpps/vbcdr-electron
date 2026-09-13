import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRM, VRMLoaderPlugin, VRMUtils, type VRMPose } from '@pixiv/three-vrm'
import {
  GESTURES,
  GESTURE_ORDER,
  type CompanionGesture,
  type GestureChannels
} from './companion-gestures'

const SMOOTHING = 10
const HEAD_CLEARANCE = 0.04
/**
 * Framed crown-to-shoulders rather than crown-to-chest: the face is unlit, so
 * its mouth and nose are baked texture detail that only reads when the head
 * covers enough pixels. FRAMED_WIDTH has to come down with it — the camera
 * takes whichever of the two constraints pulls it further back, so leaving the
 * width wide would quietly undo the crop.
 */
const SHOULDER_DROP = 0.04
const FRAMED_WIDTH = 0.22
const BLINK_INTERVAL_MIN = 2.2
const BLINK_INTERVAL_MAX = 6.5
const BLINK_DURATION = 0.12
const IDLE_FPS = 24
const DEMO_GAP = 0.7

function zQuat(degrees: number): [number, number, number, number] {
  const half = (degrees * Math.PI) / 360
  return [0, 0, Math.sin(half), Math.cos(half)]
}

const REST_POSE: VRMPose = {
  leftUpperArm: { rotation: zQuat(70) },
  rightUpperArm: { rotation: zQuat(-70) },
  leftLowerArm: { rotation: zQuat(12) },
  rightLowerArm: { rotation: zQuat(-12) }
}

const REST_ARM_DEG = { upper: -70, lower: -12 }
const RAISED_ARM_DEG = { upper: -104, lower: -78 }

export type CompanionMood = 'idle' | 'attentive' | 'thinking' | 'busy' | 'error'

const MOOD_EXPRESSION: Record<CompanionMood, { joy: number; sorrow: number; fun: number }> = {
  idle: { joy: 0.15, sorrow: 0, fun: 0 },
  attentive: { joy: 0.45, sorrow: 0, fun: 0.15 },
  thinking: { joy: 0, sorrow: 0.1, fun: 0 },
  busy: { joy: 0.2, sorrow: 0, fun: 0.1 },
  error: { joy: 0, sorrow: 0.55, fun: 0 }
}

const ZERO_CHANNELS: GestureChannels = {
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  eyeYaw: 0,
  eyePitch: 0,
  shoulder: 0,
  handRaise: 0,
  joy: 0,
  sorrow: 0,
  fun: 0,
  angry: 0,
  blink: 0,
  eyeWide: 0
}

export interface CompanionStage {
  setMood(mood: CompanionMood): void
  setPaused(paused: boolean): void
  playGesture(gesture: CompanionGesture): void
  setDemoLoop(enabled: boolean): void
  onGestureChange(cb: (gesture: CompanionGesture | null) => void): void
  /**
   * Where to look, as offsets from straight ahead in the range -1..1
   * (x right, y down). Pass null to go back to the idle sway.
   */
  setLookAt(target: { x: number; y: number } | null): void
  /** How far the mouth is open, 0..1, driven by the speech waveform. */
  setMouthLevel(level: number): void
  dispose(): void
}

/** Vowel shapes the mouth cycles through, so talking is not one held sound. */
const VISEMES = ['a', 'i', 'u', 'e', 'o'] as const
const MOUTH_SMOOTHING = 22
/** Below this the mouth is treated as shut, so silence does not leave it ajar. */
const MOUTH_FLOOR = 0.06

/**
 * Kept under the gesture ranges so following never reads as a gesture, but the
 * pitch is asymmetric: looking up needs noticeably more travel than looking
 * down before it reads as deliberate rather than as the idle sway.
 */
const LOOK_EYE_YAW = 18 * (Math.PI / 180)
const LOOK_EYE_PITCH_DOWN = 12 * (Math.PI / 180)
const LOOK_EYE_PITCH_UP = 20 * (Math.PI / 180)
const LOOK_HEAD_YAW = 9 * (Math.PI / 180)
const LOOK_HEAD_PITCH_DOWN = 7 * (Math.PI / 180)
const LOOK_HEAD_PITCH_UP = 13 * (Math.PI / 180)
const LOOK_SMOOTHING = 7

function nextBlinkDelay(): number {
  return BLINK_INTERVAL_MIN + Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN)
}

export async function createCompanionStage(
  canvas: HTMLCanvasElement,
  modelUrl: string
): Promise<CompanionStage> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20)

  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(1, 1.6, 1.6)
  scene.add(key, new THREE.AmbientLight(0xffffff, 1.1))

  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))

  const gltf = await loader.loadAsync(modelUrl)
  const vrm = gltf.userData.vrm as VRM

  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  vrm.scene.rotation.y = Math.PI
  vrm.humanoid?.setNormalizedPose(REST_POSE)
  vrm.update(0)
  scene.add(vrm.scene)

  const bone = (name: Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0]) =>
    vrm.humanoid?.getNormalizedBoneNode(name) ?? null

  const head = bone('head')
  const neck = bone('neck')
  const leftEye = bone('leftEye')
  const rightEye = bone('rightEye')
  const leftShoulder = bone('leftShoulder')
  const rightShoulder = bone('rightShoulder')
  const rightUpperArm = bone('rightUpperArm')
  const rightLowerArm = bone('rightLowerArm')
  const rightIndex = bone('rightIndexProximal')
  const rightMiddle = bone('rightMiddleProximal')
  const rightRing = bone('rightRingProximal')
  const rightLittle = bone('rightLittleProximal')
  const upperChest = bone('upperChest') ?? bone('chest')

  const headWorld = new THREE.Vector3(0, 1.35, 0)
  if (head) head.getWorldPosition(headWorld)

  const shoulderNode = leftShoulder ?? rightShoulder ?? bone('upperChest') ?? bone('chest')
  const shoulderWorld = new THREE.Vector3(0, 1.3, 0)
  if (shoulderNode) shoulderNode.getWorldPosition(shoulderWorld)

  const bounds = new THREE.Box3().setFromObject(vrm.scene)
  const crownY = Number.isFinite(bounds.max.y) ? bounds.max.y : headWorld.y + 0.18

  const framedTop = crownY + HEAD_CLEARANCE
  const framedBottom = shoulderWorld.y - SHOULDER_DROP
  const focusY = (framedTop + framedBottom) / 2
  const framedHeight = framedTop - framedBottom

  const shoulderRest = {
    left: leftShoulder?.rotation.z ?? 0,
    right: rightShoulder?.rotation.z ?? 0
  }
  const chestRestY = upperChest?.position.y ?? 0

  let mood: CompanionMood = 'idle'
  let paused = false
  let lookTarget: { x: number; y: number } | null = null
  const look = { x: 0, y: 0, weight: 0 }
  let mouthTarget = 0
  let mouth = 0
  let viseme: (typeof VISEMES)[number] = 'a'
  let mouthWasOpen = false
  const current = { joy: 0, sorrow: 0, fun: 0, angry: 0 }
  let blinkCountdown = nextBlinkDelay()
  let blinkElapsed = -1

  let active: CompanionGesture | null = null
  let gestureElapsed = 0
  let demoLoop = false
  let demoIndex = 0
  let demoGap = 0
  let notify: ((g: CompanionGesture | null) => void) | null = null

  const setActive = (next: CompanionGesture | null): void => {
    if (active === next) return
    active = next
    gestureElapsed = 0
    notify?.(next)
  }

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = canvas
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const halfFov = (camera.fov * Math.PI) / 360
    const distForHeight = framedHeight / 2 / Math.tan(halfFov)
    const distForWidth = FRAMED_WIDTH / 2 / Math.tan(halfFov) / camera.aspect
    camera.position.set(0, focusY, Math.max(distForHeight, distForWidth))
    camera.lookAt(0, focusY, 0)
    camera.updateProjectionMatrix()
  }
  resize()

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)

  const clock = new THREE.Clock()
  let frame = 0
  let last = 0

  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick)
    if (paused) return
    if (now - last < 1000 / IDLE_FPS) return
    last = now

    const delta = clock.getDelta()
    const t = clock.elapsedTime

    const ch: GestureChannels = { ...ZERO_CHANNELS }
    if (active) {
      const def = GESTURES[active]
      gestureElapsed += delta
      const p = gestureElapsed / def.duration
      if (p >= 1) {
        setActive(null)
        if (demoLoop) demoGap = DEMO_GAP
      } else {
        Object.assign(ch, def.sample(p))
      }
    } else if (demoLoop) {
      demoGap -= delta
      if (demoGap <= 0) {
        const next = GESTURE_ORDER[demoIndex % GESTURE_ORDER.length]
        demoIndex += 1
        setActive(next)
      }
    }

    const expressions = vrm.expressionManager
    if (expressions) {
      const alpha = 1 - Math.exp(-SMOOTHING * delta)
      const target = MOOD_EXPRESSION[mood]
      current.joy += (target.joy + ch.joy - current.joy) * alpha
      current.sorrow += (target.sorrow + ch.sorrow - current.sorrow) * alpha
      current.fun += (target.fun + ch.fun - current.fun) * alpha
      current.angry += (ch.angry - current.angry) * alpha
      expressions.setValue('joy', THREE.MathUtils.clamp(current.joy, 0, 1))
      expressions.setValue('sorrow', THREE.MathUtils.clamp(current.sorrow, 0, 1))
      expressions.setValue('fun', THREE.MathUtils.clamp(current.fun, 0, 1))
      expressions.setValue('angry', THREE.MathUtils.clamp(current.angry, 0, 1))

      blinkCountdown -= delta
      if (blinkCountdown <= 0 && blinkElapsed < 0) {
        blinkElapsed = 0
        blinkCountdown = nextBlinkDelay()
      }
      let blink = 0
      if (blinkElapsed >= 0) {
        blinkElapsed += delta
        const phase = blinkElapsed / BLINK_DURATION
        blink = phase < 1 ? Math.sin(phase * Math.PI) : 0
        if (phase >= 1) blinkElapsed = -1
      }
      const lids = THREE.MathUtils.clamp(Math.max(blink, ch.blink) - ch.eyeWide, 0, 1)
      expressions.setValue('blink', lids)

      // Mouth follows the waveform faster than the mood expressions settle, or
      // it lags behind the syllables and reads as dubbing.
      const mouthAlpha = 1 - Math.exp(-MOUTH_SMOOTHING * delta)
      mouth += (mouthTarget - mouth) * mouthAlpha
      const open = mouth > MOUTH_FLOOR
      // A new vowel per mouth-opening, not per frame: picking every frame is a
      // flutter, holding one for a whole line is a drone.
      if (open && !mouthWasOpen) viseme = VISEMES[Math.floor(Math.random() * VISEMES.length)]
      mouthWasOpen = open
      for (const shape of VISEMES) {
        expressions.setValue(shape, shape === viseme && open ? THREE.MathUtils.clamp(mouth, 0, 1) : 0)
      }
    }

    // A gesture owns the head and eyes while it plays, so following fades out
    // for its duration and picks the cursor back up once it ends.
    const lookAlpha = 1 - Math.exp(-LOOK_SMOOTHING * delta)
    const wantWeight = active || !lookTarget ? 0 : 1
    look.weight += (wantWeight - look.weight) * lookAlpha
    look.x += ((lookTarget?.x ?? 0) - look.x) * lookAlpha
    look.y += ((lookTarget?.y ?? 0) - look.y) * lookAlpha
    const lookX = look.x * look.weight
    const lookY = look.y * look.weight
    // Screen y grows downward while head pitch is positive-up, so the pitch
    // terms carry a negated lookY. Cursor above the canvas => lookY < 0 =>
    // pitch goes positive => she looks up.
    const lookPitch = -lookY
    const headPitchSpan = lookPitch > 0 ? LOOK_HEAD_PITCH_UP : LOOK_HEAD_PITCH_DOWN
    const eyePitchSpan = lookPitch > 0 ? LOOK_EYE_PITCH_UP : LOOK_EYE_PITCH_DOWN

    if (head) {
      const speed = mood === 'thinking' ? 1.4 : 0.6
      const sway = 1 - look.weight
      head.rotation.y = Math.sin(t * speed) * 0.05 * sway + ch.headYaw + lookX * LOOK_HEAD_YAW
      head.rotation.x = Math.sin(t * speed * 1.5) * 0.025 * sway + ch.headPitch + lookPitch * headPitchSpan
      head.rotation.z = ch.headRoll
    }
    if (neck) {
      neck.rotation.x = ch.headPitch * 0.35 + lookPitch * headPitchSpan * 0.35
      neck.rotation.y = ch.headYaw * 0.3 + lookX * LOOK_HEAD_YAW * 0.3
    }

    for (const eye of [leftEye, rightEye]) {
      if (!eye) continue
      eye.rotation.y = ch.eyeYaw + Math.sin(t * 0.9) * 0.012 + lookX * LOOK_EYE_YAW
      eye.rotation.x = ch.eyePitch + lookPitch * eyePitchSpan
    }

    if (leftShoulder) leftShoulder.rotation.z = shoulderRest.left - ch.shoulder
    if (rightShoulder) rightShoulder.rotation.z = shoulderRest.right + ch.shoulder

    if (upperChest) {
      upperChest.position.y = chestRestY + Math.sin(t * 1.1) * 0.0016
    }

    const raise = ch.handRaise
    if (rightUpperArm) {
      const deg = THREE.MathUtils.lerp(REST_ARM_DEG.upper, RAISED_ARM_DEG.upper, raise)
      rightUpperArm.rotation.z = deg * (Math.PI / 180)
    }
    if (rightLowerArm) {
      const deg = THREE.MathUtils.lerp(REST_ARM_DEG.lower, RAISED_ARM_DEG.lower, raise)
      rightLowerArm.rotation.z = deg * (Math.PI / 180)
    }
    for (const finger of [rightMiddle, rightRing, rightLittle]) {
      if (finger) finger.rotation.z = raise * -1.25
    }
    if (rightIndex) rightIndex.rotation.z = raise * -0.15

    vrm.update(delta)
    renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(tick)

  return {
    setMood(next) {
      mood = next
    },
    setPaused(next) {
      paused = next
      if (!next) clock.getDelta()
    },
    playGesture(next) {
      if (active && GESTURES[active].priority > GESTURES[next].priority) return
      setActive(next)
    },
    setDemoLoop(enabled) {
      demoLoop = enabled
      demoGap = 0
      if (!enabled) setActive(null)
    },
    onGestureChange(cb) {
      notify = cb
    },
    setMouthLevel(level) {
      mouthTarget = THREE.MathUtils.clamp(level, 0, 1)
    },
    setLookAt(target) {
      lookTarget = target
        ? {
            x: THREE.MathUtils.clamp(target.x, -1, 1),
            y: THREE.MathUtils.clamp(target.y, -1, 1)
          }
        : null
    },
    dispose() {
      cancelAnimationFrame(frame)
      observer.disconnect()
      notify = null
      VRMUtils.deepDispose(vrm.scene)
      renderer.dispose()
    }
  }
}
