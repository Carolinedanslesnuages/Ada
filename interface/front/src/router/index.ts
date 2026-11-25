import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'atelier',
      component: () => import('../views/AtelierView.vue'),
      meta: { connexionRequise: true },
    },
    {
      path: '/indicateurs',
      name: 'indicateurs',
      component: () => import('../views/IndicateursView.vue'),
      meta: { connexionRequise: true },
    },
    {
      path: '/modele',
      name: 'modele',
      component: () => import('../views/ModeleView.vue'),
      meta: { connexionRequise: true },
    },
    { path: '/connexion', name: 'connexion', component: () => import('../views/ConnexionView.vue') },
  ],
})

router.beforeEach(async (vers) => {
  const session = useSessionStore()
  if (!session.verifiee) await session.verifier()
  if (vers.meta.connexionRequise && !session.connecte) return { name: 'connexion' }
  if (vers.name === 'connexion' && session.connecte) return { name: 'atelier' }
})

router.afterEach((vers) => {
  const titres: Record<string, string> = { connexion: 'Connexion — ADA', indicateurs: 'Indicateurs — ADA', modele: 'Mon modèle — ADA' }
  document.title = titres[String(vers.name)] ?? 'ADA'
})

export default router
