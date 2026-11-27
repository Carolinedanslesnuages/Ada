import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'workshop',
      component: () => import('../views/WorkshopView.vue'),
      meta: { signInRequired: true },
    },
    {
      path: '/indicators',
      name: 'indicators',
      component: () => import('../views/IndicatorsView.vue'),
      meta: { signInRequired: true },
    },
    {
      path: '/model',
      name: 'model',
      component: () => import('../views/ModelView.vue'),
      meta: { signInRequired: true },
    },
    { path: '/sign-in', name: 'sign-in', component: () => import('../views/SignInView.vue') },
  ],
})

router.beforeEach(async (target) => {
  const session = useSessionStore()
  if (!session.verified) await session.verify()
  if (target.meta.signInRequired && !session.signedIn) return { name: 'sign-in' }
  if (target.name === 'sign-in' && session.signedIn) return { name: 'workshop' }
})

router.afterEach((target) => {
  const titles: Record<string, string> = { 'sign-in': 'Connexion — ADA', indicators: 'Indicateurs — ADA', model: 'Mon modèle — ADA' }
  document.title = titles[String(target.name)] ?? 'ADA'
})

export default router
