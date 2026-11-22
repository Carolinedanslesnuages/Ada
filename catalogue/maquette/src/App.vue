<script setup lang="ts">
import { RouterView } from 'vue-router'

const logoText = ['République', 'Française']
// Liens d'évitement (RGAA 12.7) : premiers éléments atteints au clavier.
const liensEvitement = [
  { id: 'contenu', text: 'Contenu' },
  { id: 'pied-de-page', text: 'Pied de page' },
]
</script>

<template>
  <DsfrSkipLinks :links="liensEvitement" />
  <DsfrHeader
    service-title="__NOM_PROJET__"
    service-description="__BASELINE__"
    :logo-text="logoText"
    home-to="/"
  />
  <DsfrNotice title="Maquette — données fictives : rien de ce que vous voyez n’est réel ni enregistré." />
  <main id="contenu" class="fr-container fr-my-6w" tabindex="-1">
    <RouterView />
  </main>
  <DsfrFooter id="pied-de-page" :logo-text="logoText" />
</template>
