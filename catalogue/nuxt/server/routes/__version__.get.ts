// Version du site, sans authentification et jamais en erreur (« dev » si le fichier manque).
// Générée avec les pages (`nuxt generate`) : servie comme un fichier par le site statique.
export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  return lireVersion()
})
