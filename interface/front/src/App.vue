<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const logoText = ['République', 'Française']

async function deconnecter(): Promise<void> {
  await session.deconnecter()
  await router.push({ name: 'connexion' })
}

const liensRapides = computed(() =>
  session.utilisateur
    ? [
        { label: 'Indicateurs', icon: 'fr-icon-line-chart-line', to: '/indicateurs' },
        { label: session.utilisateur.nom ?? session.utilisateur.login, icon: 'fr-icon-user-line', to: '/' },
        { label: 'Se déconnecter', icon: 'fr-icon-logout-box-r-line', button: true, onClick: deconnecter },
      ]
    : [],
)
</script>

<template>
  <DsfrHeader
    service-title="ADA"
    service-description="Atelier de Développement Assisté"
    :logo-text="logoText"
    operator-img-src="/logo-ada.svg"
    operator-img-alt="ADA"
    :operator-img-style="{ width: '5.5rem' }"
    home-to="/"
    :quick-links="liensRapides"
  />
  <main id="contenu" class="fr-container--fluid fr-px-4w fr-my-4w">
    <RouterView />
  </main>
  <DsfrFooter :logo-text="logoText" />
</template>
