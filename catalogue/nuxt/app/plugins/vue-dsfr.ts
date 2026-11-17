import VueDsfr from '@gouvminint/vue-dsfr'

/** Composants du DSFR (`Dsfr*`) disponibles dans toutes les pages. */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(VueDsfr)
})
