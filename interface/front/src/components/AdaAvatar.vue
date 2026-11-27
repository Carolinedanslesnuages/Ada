<script setup lang="ts">
import { ref } from 'vue'

/**
 * Small avatar of ADA, bottom right, waving while she works: a girl with France-blue
 * hair (bob, middle parting, bun as a nod to Ada Lovelace), light
 * face, eyes that blink now and then. One click freezes it (RGAA 13.8: an animation must be
 * stoppable); another restarts it; the choice is kept on the device. No animation either
 * if the person asked to reduce motion.
 */
defineProps<{ phase?: string | null }>()

const KEY = 'ada:avatar-immobile'
function readChoices(): boolean {
  try {
    return localStorage.getItem(KEY) === 'oui'
  } catch {
    return false
  }
}
const still = ref(readChoices())
function toggle(): void {
  still.value = !still.value
  try {
    if (still.value) localStorage.setItem(KEY, 'oui')
    else localStorage.removeItem(KEY)
  } catch {
    // storage unavailable: the choice applies to this visit
  }
}
</script>

<template>
  <button
    type="button"
    class="ada-avatar"
    :class="{ 'ada-avatar--still': still }"
    :title="still ? 'Relancer l’animation' : 'Arrêter l’animation'"
    data-testid="ada-avatar"
    @click="toggle"
  >
    <svg class="ada-avatar__drawing" aria-hidden="true" viewBox="0 0 68 64" width="54" height="51" focusable="false">
      <circle class="ada-avatar__hair" cx="29" cy="10" r="6" />
      <path class="ada-avatar__hair" d="M8 34 A21 21 0 0 1 50 34 L50 45 Q50 51 45 50.5 Q42.5 50 42.5 46 L42.5 40 L15.5 40 L15.5 46 Q15.5 50 13 50.5 Q8 51 8 45 Z" />
      <circle class="ada-avatar__face" cx="29" cy="39" r="14.5" />
      <path
        class="ada-avatar__hair"
        d="M13.5 37 Q14 22 29 21 Q44 22 44.5 37 Q41 29 30.5 27.5 Q29 26 27.5 27.5 Q17 29 13.5 37 Z"
      />
      <g class="ada-avatar__eyes">
        <ellipse cx="23" cy="39" rx="2.2" ry="2.9" />
        <ellipse cx="35" cy="39" rx="2.2" ry="2.9" />
      </g>
      <path class="ada-avatar__smile" d="M24.5 45 Q29 48.5 33.5 45" />
      <g class="ada-avatar__hand" fill="currentColor" stroke="currentColor" stroke-linecap="round">
        <rect x="52" y="27" width="11" height="12" rx="4.5" stroke="none" />
        <line x1="54" y1="28" x2="54" y2="21" stroke-width="3" />
        <line x1="57.5" y1="28" x2="57.5" y2="19" stroke-width="3" />
        <line x1="61" y1="28" x2="61" y2="21" stroke-width="3" />
        <line x1="53" y1="35" x2="49.5" y2="31" stroke-width="3" />
        <line x1="57" y1="39" x2="56" y2="46" stroke-width="5" />
      </g>
      <path class="ada-avatar__star" d="M47 4 Q47.8 8.2 52 9 Q47.8 9.8 47 14 Q46.2 9.8 42 9 Q46.2 8.2 47 4 Z" />
    </svg>
    <span class="ada-avatar__text">
      ADA {{ phase === 'implementation' ? 'réalise' : phase === 'conversation' ? 'répond' : 'analyse' }}…
    </span>
    <span class="fr-sr-only">{{ still ? ' : relancer l’animation' : ' : arrêter l’animation' }}</span>
  </button>
</template>

<style scoped>
.ada-avatar {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 750;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem 0.25rem 0.25rem;
  color: var(--text-title-blue-france);
  background: var(--background-default-grey);
  border: 1px solid var(--border-default-grey);
  border-radius: 2rem;
  box-shadow: 0 2px 6px rgb(0 0 18 / 16%);
  font: inherit;
  cursor: pointer;
}

.ada-avatar:hover {
  background: var(--background-default-grey-hover);
}

.ada-avatar:focus-visible {
  outline: 2px solid #0a76f6;
  outline-offset: 2px;
}

.ada-avatar--still .ada-avatar__hand,
.ada-avatar--still .ada-avatar__eyes {
  animation: none;
}

.ada-avatar__drawing {
  flex-shrink: 0;
}

.ada-avatar__star {
  fill: var(--text-default-error);
}

.ada-avatar__text {
  font-size: 0.875rem;
  font-weight: 700;
}

.ada-avatar__hair,
.ada-avatar__eyes {
  fill: currentColor;
}

.ada-avatar__face {
  fill: var(--background-default-grey);
  stroke: currentColor;
  stroke-width: 2.2;
}

.ada-avatar__smile {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.8;
  stroke-linecap: round;
}

.ada-avatar__eyes {
  transform-box: fill-box;
  transform-origin: center;
  animation: cligne 4.8s ease-in-out infinite;
}

.ada-avatar__hand {
  transform-box: view-box;
  transform-origin: 56px 46px;
  animation: coucou 2.4s ease-in-out infinite;
}

/* A brief blink, now and then. */
@keyframes cligne {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  95% {
    transform: scaleY(0.1);
  }
}

/* Three small waves, then a pause: present without being restless. */
@keyframes coucou {
  0%,
  45%,
  100% {
    transform: rotate(8deg);
  }
  8%,
  24% {
    transform: rotate(22deg);
  }
  16%,
  32% {
    transform: rotate(-4deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ada-avatar__hand,
  .ada-avatar__eyes {
    animation: none;
  }
}

@media (max-width: 36em) {
  .ada-avatar {
    right: 1rem;
    bottom: 1rem;
  }
  .ada-avatar__text {
    display: none;
  }
  .ada-avatar {
    padding: 0.25rem;
  }
}
</style>
