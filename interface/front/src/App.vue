<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const logoText = ['République', 'Française']
// Skip links (RGAA 12.7): first elements reached with the keyboard.
const skipLinks = [
  { id: 'content', text: 'Contenu' },
  { id: 'footer', text: 'Pied de page' },
]

async function signOutUser(): Promise<void> {
  await session.signOutUser()
  await router.push({ name: 'sign-in' })
}

const quickLinks = computed(() =>
  session.user
    ? [
        { label: 'Mon modèle', icon: 'fr-icon-settings-5-line', to: '/model' },
        { label: 'Indicateurs', icon: 'fr-icon-line-chart-line', to: '/indicators' },
        { label: session.user.name ?? session.user.login, icon: 'fr-icon-user-line', to: '/' },
        { label: 'Se déconnecter', icon: 'fr-icon-logout-box-r-line', button: true, onClick: signOutUser },
      ]
    : [],
)
</script>

<template>
  <DsfrSkipLinks :links="skipLinks" />
  <DsfrHeader
    service-title="Atelier de Développement Assisté"
    :logo-text="logoText"
    operator-img-src="/logo-ada.svg"
    operator-img-alt="ADA"
    :operator-img-style="{ width: '7rem' }"
    home-to="/"
    :quick-links="quickLinks"
  />
  <main id="content" class="fr-container--fluid fr-px-4w fr-my-4w" tabindex="-1">
    <RouterView />
  </main>
  <DsfrFooter id="footer" :logo-text="logoText" />
</template>
