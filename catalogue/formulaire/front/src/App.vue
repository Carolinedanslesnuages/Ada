<script setup lang="ts">
import { RouterView } from 'vue-router'

const logoText = ['République', 'Française']
const liensRapides = [
  { label: 'Formulaire', to: '/', icon: 'fr-icon-edit-line' },
  { label: 'Réponses', to: '/reponses', icon: 'fr-icon-table-line' },
]
</script>

<template>
  <DsfrHeader
    service-title="__NOM_PROJET__"
    service-description="__BASELINE__"
    :logo-text="logoText"
    home-to="/"
    :quick-links="liensRapides"
  />
  <main id="contenu" class="fr-container fr-my-6w">
    <RouterView />
  </main>
  <DsfrFooter :logo-text="logoText" />
</template>
