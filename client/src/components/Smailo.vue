<template>
  <svg
    ref="svgRef"
    :width="size"
    :height="size"
    viewBox="0 0 100 100"
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
    <ellipse cx="34" cy="42" rx="7" ry="8" stroke="#333" stroke-width="2" />

    <!-- Left pupil -->
    <ellipse
      ref="leftPupilRef"
      cx="34"
      cy="44"
      rx="3"
      ry="4"
      fill="#333"
    />

    <!-- Right eye white -->
    <ellipse cx="66" cy="42" rx="7" ry="8" stroke="#333" stroke-width="2" />

    <!-- Right pupil -->
    <ellipse
      ref="rightPupilRef"
      cx="66"
      cy="44"
      rx="3"
      ry="4"
      fill="#333"
    />

    <!-- Mouth -->
    <path
      ref="mouthRef"
      d="M 36 65 Q 50 74 64 65"
      stroke="#333"
      stroke-width="2.5"
      stroke-linecap="round"
      fill="none"
    />

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
const questionRef = ref<SVGTextElement | null>(null)

let activeTimeline: gsap.core.Timeline | null = null
let headVibrateTween: gsap.core.Tween | null = null

function killActive() {
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

  gsap.set(headRef.value, { rotation: 0, x: 0, y: 0, transformOrigin: '50px 50px' })
  gsap.set(leftPupilRef.value, { scaleY: 1, x: 0, transformOrigin: '34px 44px' })
  gsap.set(rightPupilRef.value, { scaleY: 1, x: 0, transformOrigin: '66px 44px' })
  gsap.set(mouthRef.value, { scaleY: 1, transformOrigin: '50px 69px' })
  gsap.set(leftBrowRef.value, { y: 0 })
  gsap.set(rightBrowRef.value, { y: 0 })
  if (questionRef.value) gsap.set(questionRef.value, { opacity: 0 })

  // Reset mouth path to neutral smile
  if (mouthRef.value) {
    mouthRef.value.setAttribute('d', 'M 36 65 Q 50 74 64 65')
  }
}

function startIdle() {
  if (!leftPupilRef.value || !rightPupilRef.value || !headRef.value) return

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 2 })

  // Slow blink every ~3s
  tl.to([leftPupilRef.value, rightPupilRef.value], {
    scaleY: 0.05,
    duration: 0.1,
    transformOrigin: 'center center',
    ease: 'power2.in',
  })
  tl.to([leftPupilRef.value, rightPupilRef.value], {
    scaleY: 1,
    duration: 0.15,
    ease: 'power2.out',
  })

  // Gentle sway
  const sway = gsap.timeline({ repeat: -1, yoyo: true })
  sway.to(headRef.value, {
    rotation: 2,
    duration: 2.5,
    ease: 'sine.inOut',
    transformOrigin: '50px 50px',
  })

  activeTimeline = tl
  // Keep sway reference to kill on cleanup
  ;(activeTimeline as any)._sway = sway
}

function startThinking() {
  if (!leftPupilRef.value || !rightPupilRef.value || !headRef.value) return

  const tl = gsap.timeline({ repeat: -1, yoyo: true })

  // Eyes shift left-right
  tl.to([leftPupilRef.value, rightPupilRef.value], {
    x: 8,
    duration: 0.4,
    ease: 'power1.inOut',
  })
  tl.to([leftPupilRef.value, rightPupilRef.value], {
    x: -8,
    duration: 0.4,
    ease: 'power1.inOut',
  })

  // Head vibrate — store reference so it can be killed on mood change
  headVibrateTween = gsap.to(headRef.value, {
    x: 2,
    duration: 0.08,
    repeat: -1,
    yoyo: true,
    ease: 'none',
    transformOrigin: '50px 50px',
  })

  activeTimeline = tl
}

function startTalking() {
  if (!mouthRef.value) return

  const tl = gsap.timeline({ repeat: -1 })

  tl.to(mouthRef.value, {
    scaleY: 1.5,
    duration: 0.15,
    ease: 'power1.in',
    transformOrigin: '50px 65px',
  })
  tl.to(mouthRef.value, {
    scaleY: 0.5,
    duration: 0.15,
    ease: 'power1.out',
    transformOrigin: '50px 65px',
  })

  activeTimeline = tl
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

  // Raise eyebrows for happiness
  gsap.to([leftBrowRef.value, rightBrowRef.value], {
    y: -4,
    duration: 0.3,
    ease: 'back.out(2)',
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

  // Fade in "?"
  tl.to(questionRef.value, {
    opacity: 1,
    duration: 0.3,
    ease: 'power1.in',
  }, '-=0.1')

  activeTimeline = tl
}

function applyMood(mood: Mood) {
  // Kill any existing sway timeline
  if (activeTimeline && (activeTimeline as any)._sway) {
    ;(activeTimeline as any)._sway.kill()
  }
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
  if (activeTimeline && (activeTimeline as any)._sway) {
    ;(activeTimeline as any)._sway.kill()
  }
  killActive()
  gsap.killTweensOf([
    headRef.value,
    leftPupilRef.value,
    rightPupilRef.value,
    mouthRef.value,
    leftBrowRef.value,
    rightBrowRef.value,
    questionRef.value,
  ])
})
</script>

<style scoped>
.smailo {
  display: block;
}
</style>
