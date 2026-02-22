<template>
  <svg
    ref="svgRef"
    :width="size"
    :height="size"
    viewBox="-10 0 120 115"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="smailo"
  >
    <!-- Head -->
    <circle
      ref="headRef"
      cx="50"
      cy="50"
      r="38"
      fill="none"
      stroke="#333"
      stroke-width="2.5"
      stroke-linecap="round"
    />

    <!-- Left eyebrow -->
    <path
      ref="leftBrowRef"
      d="M 28 30 Q 34 26 40 29"
      stroke="#333"
      stroke-width="2"
      stroke-linecap="round"
      fill="none"
    />

    <!-- Right eyebrow -->
    <path
      ref="rightBrowRef"
      d="M 60 29 Q 66 26 72 30"
      stroke="#333"
      stroke-width="2"
      stroke-linecap="round"
      fill="none"
    />

    <!-- Left eye white -->
    <ellipse cx="34" cy="42" rx="7" ry="8" fill="white" stroke="#333" stroke-width="2" />
    <!-- Left pupil -->
    <ellipse
      ref="leftPupilRef"
      cx="34"
      cy="44"
      rx="3"
      ry="4"
      fill="#333"
    />
    <!-- Left eye glint -->
    <ellipse cx="35.5" cy="41.5" rx="1.2" ry="1.2" fill="white" />

    <!-- Right eye white -->
    <ellipse cx="66" cy="42" rx="7" ry="8" fill="white" stroke="#333" stroke-width="2" />
    <!-- Right pupil -->
    <ellipse
      ref="rightPupilRef"
      cx="66"
      cy="44"
      rx="3"
      ry="4"
      fill="#333"
    />
    <!-- Right eye glint -->
    <ellipse cx="67.5" cy="41.5" rx="1.2" ry="1.2" fill="white" />

    <!-- Mouth -->
    <path
      ref="mouthRef"
      d="M 36 65 Q 50 74 64 65"
      stroke="#333"
      stroke-width="2.5"
      stroke-linecap="round"
      fill="none"
    />

    <!-- Left arm + hand -->
    <path
      ref="leftArmRef"
      d="M 15 62 Q 2 68 5 78"
      stroke="#333"
      stroke-width="3"
      stroke-linecap="round"
      fill="none"
    />
    <circle ref="leftHandRef" cx="5" cy="80" r="5" fill="#333" />

    <!-- Right arm + hand -->
    <path
      ref="rightArmRef"
      d="M 85 62 Q 98 68 95 78"
      stroke="#333"
      stroke-width="3"
      stroke-linecap="round"
      fill="none"
    />
    <circle ref="rightHandRef" cx="95" cy="80" r="5" fill="#333" />

    <!-- Confused "?" text (hidden by default) -->
    <text
      ref="questionRef"
      x="75"
      y="25"
      font-size="16"
      font-family="Georgia, serif"
      fill="#333"
      opacity="0"
    >?</text>
  </svg>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import type { Mood } from '../types'

const props = withDefaults(defineProps<{
  mood: Mood
  size?: number
}>(), {
  mood: 'idle',
  size: 200,
})

const svgRef = ref<SVGSVGElement | null>(null)
const headRef = ref<SVGCircleElement | null>(null)
const leftPupilRef = ref<SVGEllipseElement | null>(null)
const rightPupilRef = ref<SVGEllipseElement | null>(null)
const mouthRef = ref<SVGPathElement | null>(null)
const leftBrowRef = ref<SVGPathElement | null>(null)
const rightBrowRef = ref<SVGPathElement | null>(null)
const leftArmRef = ref<SVGPathElement | null>(null)
const rightArmRef = ref<SVGPathElement | null>(null)
const leftHandRef = ref<SVGCircleElement | null>(null)
const rightHandRef = ref<SVGCircleElement | null>(null)
const questionRef = ref<SVGTextElement | null>(null)

let activeTimeline: gsap.core.Timeline | null = null
const subTweens = new Map<string, gsap.core.Tween | gsap.core.Timeline>()
let headVibrateTween: gsap.core.Tween | null = null
let thinkingActive = false

// Default arm path points: [mx, my, qx, qy, ex, ey]
const L_ARM_DEFAULT = [15, 62, 2, 68, 5, 78]
const R_ARM_DEFAULT = [85, 62, 98, 68, 95, 78]

function morphArm(el: SVGPathElement | null, from: number[], to: number[], t: number) {
  if (!el) return
  const p = from.map((v, i) => +(v + (to[i] - v) * t).toFixed(2))
  el.setAttribute('d', `M ${p[0]} ${p[1]} Q ${p[2]} ${p[3]} ${p[4]} ${p[5]}`)
}

function morphHand(el: SVGCircleElement | null, fx: number, fy: number, tx: number, ty: number, t: number) {
  if (!el) return
  el.setAttribute('cx', String(+(fx + (tx - fx) * t).toFixed(2)))
  el.setAttribute('cy', String(+(fy + (ty - fy) * t).toFixed(2)))
}

function killActive() {
  thinkingActive = false
  for (const tween of subTweens.values()) tween.kill()
  subTweens.clear()
  if (activeTimeline) {
    activeTimeline.kill()
    activeTimeline = null
  }
  if (headVibrateTween) {
    headVibrateTween.kill()
    headVibrateTween = null
  }
}

function resetElements() {
  if (!headRef.value || !leftPupilRef.value || !rightPupilRef.value || !mouthRef.value) return

  // Kill any lingering one-shot tweens before resetting values
  gsap.killTweensOf([
    headRef.value, leftPupilRef.value, rightPupilRef.value,
    mouthRef.value, leftBrowRef.value, rightBrowRef.value,
    leftArmRef.value, rightArmRef.value, leftHandRef.value, rightHandRef.value,
  ])

  gsap.set(headRef.value, { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, transformOrigin: '50px 50px' })
  gsap.set(leftPupilRef.value, { scaleY: 1, scaleX: 1, x: 0, y: 0, transformOrigin: '34px 44px' })
  gsap.set(rightPupilRef.value, { scaleY: 1, scaleX: 1, x: 0, y: 0, transformOrigin: '66px 44px' })
  gsap.set(mouthRef.value, { scaleY: 1, transformOrigin: '50px 69px' })
  gsap.set(leftBrowRef.value, { y: 0 })
  gsap.set(rightBrowRef.value, { y: 0 })
  if (leftArmRef.value) {
    gsap.set(leftArmRef.value, { y: 0 })
    leftArmRef.value.setAttribute('d', 'M 15 62 Q 2 68 5 78')
  }
  if (rightArmRef.value) {
    gsap.set(rightArmRef.value, { y: 0 })
    rightArmRef.value.setAttribute('d', 'M 85 62 Q 98 68 95 78')
  }
  if (leftHandRef.value) {
    gsap.set(leftHandRef.value, { y: 0 })
    leftHandRef.value.setAttribute('cx', '5')
    leftHandRef.value.setAttribute('cy', '80')
  }
  if (rightHandRef.value) {
    gsap.set(rightHandRef.value, { y: 0 })
    rightHandRef.value.setAttribute('cx', '95')
    rightHandRef.value.setAttribute('cy', '80')
  }
  if (questionRef.value) gsap.set(questionRef.value, { opacity: 0 })

  // Reset mouth path to neutral smile
  if (mouthRef.value) {
    mouthRef.value.setAttribute('d', 'M 36 65 Q 50 74 64 65')
  }
}

function startIdle() {
  if (!leftPupilRef.value || !rightPupilRef.value || !headRef.value) return

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 2 })

  // Blink — pupils close + brows lift slightly (natural eyebrow flash)
  tl.to([leftPupilRef.value, rightPupilRef.value], {
    scaleY: 0.05,
    duration: 0.1,
    transformOrigin: 'center center',
    ease: 'power2.in',
  })
  tl.to([leftBrowRef.value, rightBrowRef.value], {
    y: -2, duration: 0.1, ease: 'power2.in',
  }, '<')
  tl.to([leftPupilRef.value, rightPupilRef.value], {
    scaleY: 1,
    duration: 0.15,
    ease: 'power2.out',
  })
  tl.to([leftBrowRef.value, rightBrowRef.value], {
    y: 0, duration: 0.15, ease: 'power2.out',
  }, '<')

  // Gentle sway
  const sway = gsap.timeline({ repeat: -1, yoyo: true })
  sway.to(headRef.value, {
    rotation: 2,
    duration: 2.5,
    ease: 'sine.inOut',
    transformOrigin: '50px 50px',
  })

  // Subtle breathing — very gentle scale pulse on the head
  const breathe = gsap.to(headRef.value, {
    scaleX: 1.018,
    scaleY: 1.018,
    duration: 2.5,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
    transformOrigin: '50px 50px',
  })

  activeTimeline = tl
  subTweens.set('sway', sway)
  subTweens.set('breathe', breathe)
}

function startThinking() {
  if (!leftPupilRef.value || !rightPupilRef.value || !headRef.value) return

  thinkingActive = true

  // Eyes scan in a gentle arc (up-left → down-right)
  const tl = gsap.timeline({ repeat: -1, yoyo: true })
  tl.to([leftPupilRef.value, rightPupilRef.value], {
    x: 3, y: -2, duration: 0.5, ease: 'power1.inOut',
  })
  tl.to([leftPupilRef.value, rightPupilRef.value], {
    x: -3, y: 2, duration: 0.5, ease: 'power1.inOut',
  })

  // Furrow brows — concentration look
  gsap.to([leftBrowRef.value, rightBrowRef.value], {
    y: 3, duration: 0.4, ease: 'power2.out',
  })

  // Slow uncertain head tilt
  headVibrateTween = gsap.to(headRef.value, {
    rotation: 4, duration: 0.7, ease: 'sine.inOut',
    yoyo: true, repeat: -1, transformOrigin: '50px 50px',
  })

  // Left arm: very gentle idle sway
  const leftSway = gsap.to([leftArmRef.value, leftHandRef.value], {
    y: -3, duration: 1.9, ease: 'sine.inOut', yoyo: true, repeat: -1,
  })

  // Right arm scratch near temple
  const R_THINK_BASE = [85, 62, 100, 52, 96, 44]

  // Scratch oscillation — rapid small back/forth of hand near head
  const scratchObj = { d: 0 }
  const scratchTween = gsap.to(scratchObj, {
    d: 2.5, duration: 0.08, ease: 'sine.inOut', yoyo: true, repeat: -1,
    paused: true,
    onUpdate() {
      const d = scratchObj.d
      if (rightArmRef.value) {
        rightArmRef.value.setAttribute(
          'd', `M 85 62 Q ${+(100 + d).toFixed(1)} ${+(52 - d * 0.4).toFixed(1)} ${+(96 + d).toFixed(1)} ${+(44 - d * 0.3).toFixed(1)}`
        )
      }
      if (rightHandRef.value) {
        rightHandRef.value.setAttribute('cx', String(+(96 + d).toFixed(1)))
        rightHandRef.value.setAttribute('cy', String(+(43 - d * 0.3).toFixed(1)))
      }
    },
  })

  function raiseArmAndScratch(jx = 0, jy = 0) {
    if (!thinkingActive) return
    const target = [85, 62, 100 + jx, 52 + jy, 96 + jx * 0.5, 44 + jy * 0.5]
    const hx = 96 + jx * 0.5
    const hy = 43 + jy * 0.5
    const up = { t: 0 }
    gsap.to(up, {
      t: 1, duration: 0.4, ease: 'power2.out',
      onUpdate() { morphArm(rightArmRef.value, R_ARM_DEFAULT, target, up.t); morphHand(rightHandRef.value, 95, 80, hx, hy, up.t) },
      onComplete() { if (!thinkingActive) return; scratchTween.play(); scheduleRandomDrop() },
    })
  }

  function scheduleRandomDrop() {
    if (!thinkingActive) return
    gsap.delayedCall(2.5 + Math.random() * 3.5, () => {
      if (!thinkingActive) return
      scratchTween.pause()
      const down = { t: 1 }
      gsap.to(down, {
        t: 0, duration: 0.3, ease: 'power2.in',
        onUpdate() { morphArm(rightArmRef.value, R_ARM_DEFAULT, R_THINK_BASE, down.t); morphHand(rightHandRef.value, 95, 80, 96, 43, down.t) },
        onComplete() {
          if (!thinkingActive) return
          gsap.delayedCall(0.3 + Math.random() * 0.6, () => {
            if (!thinkingActive) return
            raiseArmAndScratch((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4)
          })
        },
      })
    })
  }

  raiseArmAndScratch()

  activeTimeline = tl
  subTweens.set('scratch', scratchTween)
  subTweens.set('leftSway', leftSway)
}

function startTalking() {
  if (!mouthRef.value || !leftPupilRef.value || !rightPupilRef.value) return

  // Proxy object to interpolate mouth openness (0 = closed, 1 = fully open)
  const proxy = { open: 0 }

  function updateMouth() {
    const o = proxy.open
    const cy = 65 - o * 2
    const qy = 74 + o * 4
    if (mouthRef.value) {
      mouthRef.value.setAttribute('d', `M 36 ${cy} Q 50 ${qy} 64 ${cy}`)
    }
  }

  const tl = gsap.timeline({ repeat: -1 })

  // Syllable 1 — full open → close (brows + arms lift on open)
  tl.to(proxy, { open: 1, duration: 0.15, ease: 'power1.in', onUpdate: updateMouth })
  tl.to([leftBrowRef.value, rightBrowRef.value], { y: -2, duration: 0.15, ease: 'power1.in' }, '<')
  tl.to([leftArmRef.value, rightArmRef.value], { y: -4, duration: 0.15, ease: 'power1.in' }, '<')
  tl.to([leftHandRef.value, rightHandRef.value], { y: -4, duration: 0.15, ease: 'power1.in' }, '<')
  tl.to(proxy, { open: 0, duration: 0.12, ease: 'power1.out', onUpdate: updateMouth })
  tl.to([leftBrowRef.value, rightBrowRef.value], { y: 0, duration: 0.12, ease: 'power1.out' }, '<')
  tl.to([leftArmRef.value, rightArmRef.value], { y: 0, duration: 0.12, ease: 'power1.out' }, '<')
  tl.to([leftHandRef.value, rightHandRef.value], { y: 0, duration: 0.12, ease: 'power1.out' }, '<')
  // Short pause between syllables
  tl.to({}, { duration: 0.06 })
  // Syllable 2 — half open → close
  tl.to(proxy, { open: 0.65, duration: 0.12, ease: 'power1.in', onUpdate: updateMouth })
  tl.to([leftBrowRef.value, rightBrowRef.value], { y: -1, duration: 0.12, ease: 'power1.in' }, '<')
  tl.to([leftArmRef.value, rightArmRef.value], { y: -2, duration: 0.12, ease: 'power1.in' }, '<')
  tl.to([leftHandRef.value, rightHandRef.value], { y: -2, duration: 0.12, ease: 'power1.in' }, '<')
  tl.to(proxy, { open: 0, duration: 0.1, ease: 'power1.out', onUpdate: updateMouth })
  tl.to([leftBrowRef.value, rightBrowRef.value], { y: 0, duration: 0.1, ease: 'power1.out' }, '<')
  tl.to([leftArmRef.value, rightArmRef.value], { y: 0, duration: 0.1, ease: 'power1.out' }, '<')
  tl.to([leftHandRef.value, rightHandRef.value], { y: 0, duration: 0.1, ease: 'power1.out' }, '<')
  // Longer pause before next cycle
  tl.to({}, { duration: 0.18 })

  // Periodic blink while talking — separate tween
  const blink = gsap.timeline({ repeat: -1, repeatDelay: 2.05 })
  blink.to([leftPupilRef.value, rightPupilRef.value], {
    scaleY: 0.05, duration: 0.08, ease: 'power2.in', transformOrigin: 'center center',
  })
  blink.to([leftPupilRef.value, rightPupilRef.value], {
    scaleY: 1, duration: 0.12, ease: 'power2.out', transformOrigin: 'center center',
  })

  activeTimeline = tl
  subTweens.set('blink', blink)
}

function startHappy() {
  if (!mouthRef.value || !headRef.value) return

  // Wide smile — morph path to a deeper arc
  gsap.to(mouthRef.value, {
    duration: 0.3,
    ease: 'back.out(1.5)',
    onUpdate() {
      if (mouthRef.value) {
        mouthRef.value.setAttribute('d', 'M 30 63 Q 50 82 70 63')
      }
    },
  })

  // Raise eyebrows + squint pupils (happiness squint)
  gsap.to([leftBrowRef.value, rightBrowRef.value], {
    y: -4, duration: 0.3, ease: 'back.out(2)',
  })
  gsap.to([leftPupilRef.value, rightPupilRef.value], {
    scaleY: 0.6, duration: 0.3, ease: 'back.out(2)',
    transformOrigin: 'center center',
  })

  // Both arms raise in celebration
  const lProxy = { t: 0 }, rProxy = { t: 0 }
  const lHappy = [15, 62, -2, 46, 3, 32]
  const rHappy = [85, 62, 102, 46, 97, 32]
  gsap.to(lProxy, {
    t: 1, duration: 0.4, ease: 'back.out(1.5)',
    onUpdate() {
      morphArm(leftArmRef.value, L_ARM_DEFAULT, lHappy, lProxy.t)
      morphHand(leftHandRef.value, 5, 80, 3, 30, lProxy.t)
    },
  })
  gsap.to(rProxy, {
    t: 1, duration: 0.4, ease: 'back.out(1.5)',
    onUpdate() {
      morphArm(rightArmRef.value, R_ARM_DEFAULT, rHappy, rProxy.t)
      morphHand(rightHandRef.value, 95, 80, 97, 30, rProxy.t)
    },
  })

  // One-shot head scale pulse, then bounce loop
  gsap.to(headRef.value, {
    scaleX: 1.08, scaleY: 1.08, duration: 0.2, ease: 'power2.out',
    transformOrigin: '50px 50px', yoyo: true, repeat: 1,
  })

  const tl = gsap.timeline({ repeat: -1, yoyo: true })
  tl.to(headRef.value, {
    y: -10,
    duration: 0.4,
    ease: 'power2.out',
    transformOrigin: '50px 50px',
  })
  tl.to(headRef.value, {
    y: 0,
    duration: 0.4,
    ease: 'bounce.out',
  })

  activeTimeline = tl
}

function startConfused() {
  if (!headRef.value || !questionRef.value) return

  const tl = gsap.timeline()

  // Head tilt
  tl.to(headRef.value, {
    rotation: 15,
    duration: 0.4,
    ease: 'back.out(1.7)',
    transformOrigin: '50px 50px',
  })

  // Asymmetric brows — left up, right furrowed (classic confused look)
  tl.to(leftBrowRef.value, { y: -3, duration: 0.35, ease: 'back.out(2)' }, '<')
  tl.to(rightBrowRef.value, { y: 2, duration: 0.35, ease: 'power2.out' }, '<')

  // Both arms shrug (raise outward)
  const lProxy = { t: 0 }, rProxy = { t: 0 }
  const lShrug = [15, 62, 1, 57, -2, 58]
  const rShrug = [85, 62, 99, 57, 102, 58]
  gsap.to(lProxy, {
    t: 1, duration: 0.4, ease: 'back.out(1.7)',
    onUpdate() {
      morphArm(leftArmRef.value, L_ARM_DEFAULT, lShrug, lProxy.t)
      morphHand(leftHandRef.value, 5, 80, -3, 59, lProxy.t)
    },
  })
  gsap.to(rProxy, {
    t: 1, duration: 0.4, ease: 'back.out(1.7)',
    onUpdate() {
      morphArm(rightArmRef.value, R_ARM_DEFAULT, rShrug, rProxy.t)
      morphHand(rightHandRef.value, 95, 80, 103, 59, rProxy.t)
    },
  })

  // Fade in "?"
  tl.to(questionRef.value, {
    opacity: 1,
    duration: 0.3,
    ease: 'power1.in',
  }, '-=0.1')

  // Gentle uncertain wobble around the tilted position
  tl.to(headRef.value, {
    rotation: 12,
    duration: 1,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
    transformOrigin: '50px 50px',
  })

  activeTimeline = tl
}

function applyMood(mood: Mood) {
  killActive()
  resetElements()

  switch (mood) {
    case 'idle':      startIdle();     break
    case 'thinking':  startThinking(); break
    case 'talking':   startTalking();  break
    case 'happy':     startHappy();    break
    case 'confused':  startConfused(); break
  }
}

watch(() => props.mood, (newMood) => {
  applyMood(newMood)
})

onMounted(() => {
  applyMood(props.mood)
})

onUnmounted(() => {
  killActive()
  gsap.killTweensOf([
    headRef.value,
    leftPupilRef.value,
    rightPupilRef.value,
    mouthRef.value,
    leftBrowRef.value,
    rightBrowRef.value,
    leftArmRef.value,
    rightArmRef.value,
    leftHandRef.value,
    rightHandRef.value,
    questionRef.value,
  ])
})
</script>

<style scoped>
.smailo {
  display: block;
}
</style>
