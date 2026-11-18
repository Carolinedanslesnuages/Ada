<script setup lang="ts">
/**
 * Petit avatar d'ADA, en bas à droite, qui fait coucou tant qu'elle travaille. Purement
 * décoratif : l'information « ADA travaille » est déjà annoncée dans le fil de la demande
 * (role="status"), donc l'avatar est masqué aux lecteurs d'écran et ne capte aucun clic.
 * Sans animation si la personne a demandé à réduire les mouvements.
 */
defineProps<{ phase?: string | null }>()
</script>

<template>
  <div class="avatar-ada" aria-hidden="true" data-testid="avatar-ada">
    <svg class="avatar-ada__dessin" viewBox="0 0 64 64" width="48" height="48" focusable="false">
      <g fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
        <circle cx="28" cy="36" r="18" />
        <path d="M21 41 Q28 47 35 41" />
        <g class="avatar-ada__main">
          <line x1="45" y1="47" x2="52" y2="31" />
          <rect x="47.5" y="20" width="12" height="11" rx="4" fill="currentColor" stroke="none" />
          <line x1="49.5" y1="20" x2="49.5" y2="13.5" stroke-width="3" />
          <line x1="53" y1="20" x2="53" y2="11.5" stroke-width="3" />
          <line x1="56.5" y1="20" x2="56.5" y2="12" stroke-width="3" />
          <line x1="59" y1="22" x2="61" y2="16" stroke-width="3" />
          <line x1="48" y1="27" x2="44" y2="23" stroke-width="3" />
        </g>
      </g>
      <circle cx="22" cy="32" r="2.2" fill="currentColor" />
      <circle cx="34" cy="32" r="2.2" fill="currentColor" />
      <path class="avatar-ada__etoile" d="M12 6 Q12.8 10.2 17 11 Q12.8 11.8 12 16 Q11.2 11.8 7 11 Q11.2 10.2 12 6 Z" />
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

.avatar-ada__main {
  transform-box: view-box;
  transform-origin: 45px 47px;
  animation: coucou 2.4s ease-in-out infinite;
}

/* Trois petits signes de la main, puis une pause : présent sans être agité. */
@keyframes coucou {
  0%,
  45%,
  100% {
    transform: rotate(0deg);
  }
  8%,
  24% {
    transform: rotate(16deg);
  }
  16%,
  32% {
    transform: rotate(-8deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .avatar-ada__main {
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
