<script setup lang="ts">
/**
 * Petit avatar d'ADA, en bas à droite, qui fait coucou tant qu'elle travaille. Purement
 * décoratif : l'information « ADA travaille » est déjà annoncée dans le fil de la demande
 * (role="status"), donc l'avatar est masqué aux lecteurs d'écran et ne capte aucun clic.
 * Tête pleine en bleu France, chignon en clin d'œil à Ada Lovelace, yeux qui clignent parfois.
 * Sans animation si la personne a demandé à réduire les mouvements.
 */
defineProps<{ phase?: string | null }>()
</script>

<template>
  <div class="avatar-ada" aria-hidden="true" data-testid="avatar-ada">
    <svg class="avatar-ada__dessin" viewBox="0 0 68 64" width="52" height="49" focusable="false">
      <circle cx="29" cy="12" r="6" fill="currentColor" />
      <circle cx="29" cy="36" r="21" fill="currentColor" />
      <g class="avatar-ada__yeux">
        <ellipse cx="22" cy="34" rx="2.5" ry="3.3" />
        <ellipse cx="36" cy="34" rx="2.5" ry="3.3" />
      </g>
      <path class="avatar-ada__sourire" d="M23 42 Q29 47 35 42" />
      <g class="avatar-ada__main" fill="currentColor" stroke="currentColor" stroke-linecap="round">
        <rect x="51" y="27" width="11" height="12" rx="4.5" stroke="none" />
        <line x1="53" y1="28" x2="53" y2="21" stroke-width="3" />
        <line x1="56.5" y1="28" x2="56.5" y2="19" stroke-width="3" />
        <line x1="60" y1="28" x2="60" y2="21" stroke-width="3" />
        <line x1="52" y1="35" x2="48.5" y2="31" stroke-width="3" />
        <line x1="56" y1="39" x2="55" y2="46" stroke-width="5" />
      </g>
      <path class="avatar-ada__etoile" d="M50 5 Q50.8 9.2 55 10 Q50.8 10.8 50 15 Q49.2 10.8 45 10 Q49.2 9.2 50 5 Z" />
    </svg>
    <span class="avatar-ada__texte">
      ADA {{ phase === 'realisation' ? 'réalise' : 'analyse' }}…
    </span>
  </div>
</template>

<style scoped>
.avatar-ada {
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
  pointer-events: none;
}

.avatar-ada__dessin {
  flex-shrink: 0;
}

.avatar-ada__etoile {
  fill: var(--text-default-error);
}

.avatar-ada__texte {
  font-size: 0.875rem;
  font-weight: 700;
}

.avatar-ada__yeux,
.avatar-ada__sourire {
  fill: var(--background-default-grey);
}

.avatar-ada__sourire {
  fill: none;
  stroke: var(--background-default-grey);
  stroke-width: 2.8;
  stroke-linecap: round;
}

.avatar-ada__yeux {
  transform-box: fill-box;
  transform-origin: center;
  animation: cligne 4.8s ease-in-out infinite;
}

.avatar-ada__main {
  transform-box: view-box;
  transform-origin: 55px 46px;
  animation: coucou 2.4s ease-in-out infinite;
}

/* Un clignement bref, de temps en temps. */
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

/* Trois petits signes de la main, puis une pause : présent sans être agité. */
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
  .avatar-ada__main,
  .avatar-ada__yeux {
    animation: none;
  }
}

@media (max-width: 36em) {
  .avatar-ada {
    right: 1rem;
    bottom: 1rem;
  }
  .avatar-ada__texte {
    display: none;
  }
  .avatar-ada {
    padding: 0.25rem;
  }
}
</style>
