import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ApiError } from '@/services/api'

export interface User {
  login: string
  name: string | null
  avatar: string
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null)
  const verified = ref(false)
  const signedIn = computed(() => user.value !== null)

  async function verify(): Promise<void> {
    try {
      user.value = await api.read<User>('/auth/me')
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e
      user.value = null
    } finally {
      verified.value = true
    }
  }

  async function signOutUser(): Promise<void> {
    await api.send('/auth/sign-out', {})
    user.value = null
  }

  return { user, verified, signedIn, verify, signOutUser }
})

// Hot update in development: without this, an open tab keeps the old version of the store.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useSessionStore, import.meta.hot))
