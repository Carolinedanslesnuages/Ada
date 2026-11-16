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
  document.title = vers.name === 'connexion' ? 'Connexion — Atelier PO' : 'Atelier PO'
})

export default router
