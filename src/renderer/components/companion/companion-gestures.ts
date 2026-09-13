export type CompanionGesture =
  | 'acknowledge'
  | 'thinkingAside'
  | 'perkUp'
  | 'affirm'
  | 'wince'
  | 'consider'

export interface GestureChannels {
  headPitch: number
  headYaw: number
  headRoll: number
  eyeYaw: number
  eyePitch: number
  shoulder: number
  handRaise: number
  joy: number
  sorrow: number
  fun: number
  angry: number
  blink: number
  eyeWide: number
}

export interface GestureDef {
  label: string
  duration: number
  priority: number
  sample(p: number): Partial<GestureChannels>
}

const DEG = Math.PI / 180

function easeOutBack(p: number): number {
  const c = 1.7
  const x = p - 1
  return 1 + (c + 1) * x * x * x + c * x * x
}

function pulse(p: number): number {
  return Math.sin(p * Math.PI)
}

function settle(p: number, cycles: number, damping: number): number {
  return Math.sin(p * Math.PI * 2 * cycles) * Math.exp(-damping * p)
}

function rampInOut(p: number, edge: number): number {
  if (p < edge) return p / edge
  if (p > 1 - edge) return (1 - p) / edge
  return 1
}

export const GESTURES: Record<CompanionGesture, GestureDef> = {
  acknowledge: {
    label: 'Acknowledge',
    duration: 0.9,
    priority: 2,
    sample: (p) => ({
      headPitch: settle(p, 1, 3.2) * 9 * DEG,
      joy: pulse(p) * 0.2
    })
  },

  thinkingAside: {
    label: 'Thinking aside',
    duration: 2.6,
    priority: 1,
    sample: (p) => {
      const hold = rampInOut(p, 0.28)
      return {
        headRoll: hold * 12 * DEG,
        headYaw: hold * -16 * DEG,
        headPitch: hold * -4 * DEG,
        eyeYaw: hold * -22 * DEG,
        eyePitch: hold * -8 * DEG,
        fun: hold * 0.25
      }
    }
  },

  perkUp: {
    label: 'Perk up',
    duration: 1.1,
    priority: 3,
    sample: (p) => {
      const rise = p < 0.3 ? easeOutBack(p / 0.3) : 1 - (p - 0.3) / 0.7
      return {
        headPitch: rise * -7 * DEG,
        shoulder: rise * 5 * DEG,
        eyeWide: rise * 0.55,
        joy: rise * 0.3
      }
    }
  },

  affirm: {
    label: 'Affirm',
    duration: 1.3,
    priority: 3,
    sample: (p) => ({
      headPitch: settle(p, 2, 2.4) * 8 * DEG,
      joy: rampInOut(p, 0.2) * 0.85,
      blink: p > 0.55 && p < 0.68 ? pulse((p - 0.55) / 0.13) : 0
    })
  },

  wince: {
    label: 'Wince',
    duration: 1.4,
    priority: 4,
    sample: (p) => {
      const hit = p < 0.18 ? easeOutBack(p / 0.18) : Math.exp(-3 * (p - 0.18))
      return {
        headPitch: hit * 6 * DEG,
        headRoll: hit * -9 * DEG,
        shoulder: hit * -6 * DEG,
        sorrow: hit * 0.7,
        angry: hit * 0.25,
        blink: hit * 0.5
      }
    }
  },

  consider: {
    label: 'Consider',
    duration: 3.2,
    priority: 1,
    sample: (p) => {
      const hold = rampInOut(p, 0.22)
      return {
        handRaise: hold,
        headRoll: hold * 9 * DEG,
        headPitch: hold * 3 * DEG,
        eyeYaw: hold * 14 * DEG,
        eyePitch: hold * -6 * DEG,
        fun: hold * 0.2
      }
    }
  }
}

/**
 * The gestures that read as unprompted rather than as an answer. Both are
 * priority 1, so a real reaction interrupts an idle fidget rather than queueing
 * behind it. The nods and the wince are deliberately absent: agreeing or
 * flinching at nothing reads as a glitch, not as life.
 */
export const IDLE_GESTURES: CompanionGesture[] = ['thinkingAside', 'consider']

export const GESTURE_ORDER: CompanionGesture[] = [
  'acknowledge',
  'perkUp',
  'thinkingAside',
  'consider',
  'affirm',
  'wince'
]
