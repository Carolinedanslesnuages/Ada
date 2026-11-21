// Site Nuxt avec le DSFR, pages générées à l'avance (`nuxt generate`) : chaque page est un fichier
// HTML complet, bien lu par les moteurs de recherche et les lecteurs d'écran.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      titleTemplate: '%s — __NOM_PROJET__',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    },
  },
  css: [
    '@gouvfr/dsfr/dist/dsfr.min.css',
    '@gouvfr/dsfr/dist/utility/icons/icons.min.css',
    '@gouvminint/vue-dsfr/dist/vue-dsfr.css',
  ],
  build: { transpile: ['@gouvminint/vue-dsfr'] },
  // Le DSFR contient des media queries réservées à Internet Explorer que le minificateur refuse.
  vite: { css: { lightningcss: { errorRecovery: true } } },
  modules: ['@nuxt/test-utils/module'],
  // La route de version est générée avec les pages, comme un fichier (contrat repo-version-json).
  nitro: { prerender: { routes: ['/__version__'] } },
})
