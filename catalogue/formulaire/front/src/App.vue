<script setup lang="ts">
import { RouterView } from 'vue-router'

const logoText = ['République', 'Française']
// Liens d'évitement (RGAA 12.7) : premiers éléments atteints au clavier.
const liensEvitement = [
  { id: 'contenu', text: 'Contenu' },
  { id: 'pied-de-page', text: 'Pied de page' },
]
const liensRapides = [
  { label: 'Formulaire', to: '/', icon: 'fr-icon-edit-line' },
  { label: 'Réponses', to: '/reponses', icon: 'fr-icon-table-line' },
]
</script>

<template>
  <DsfrSkipLinks :links="liensEvitement" />
  <DsfrHeader
    service-title="__NOM_PROJET__"
    service-description="__BASELINE__"
    :logo-text="logoText"
    home-to="/"
    :quick-links="liensRapides"
  />
  <main id="contenu" class="fr-container fr-my-6w" tabindex="-1">
    <RouterView />
  </main>
  <DsfrFooter id="pied-de-page" :logo-text="logoText" />
</template>
