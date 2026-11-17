<script setup lang="ts">
const logoText = ['République', 'Française']
const liensEvitement = [
  { id: 'contenu', text: 'Contenu' },
  { id: 'pied-de-page', text: 'Pied de page' },
]
const liensPiedDePage = [{ label: 'Accessibilité : non conforme', to: '/accessibilite' }]
</script>

<template>
  <DsfrSkipLinks :links="liensEvitement" />
  <DsfrHeader service-title="__NOM_PROJET__" service-description="__BASELINE__" :logo-text="logoText" home-to="/" />
  <main id="contenu" class="fr-container fr-my-6w" tabindex="-1">
    <NuxtPage />
  </main>
  <DsfrFooter id="pied-de-page" :logo-text="logoText" :mandatory-links="liensPiedDePage" />
</template>
