<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { api } from '@/services/api'

interface Apercu {
  etat: 'arrete' | 'demarrage' | 'pret' | 'erreur'
  url: string | null
  journal: string | null
}

const props = defineProps<{ projet: string | null; intervalleMs?: number }>()

const apercu = ref<Apercu | null>(null)
const erreur = ref<string | null>(null)
const cle = ref(0)
let minuteur: ReturnType<typeof setTimeout> | null = null

const chemin = (projet: string) => `/projets/${encodeURIComponent(projet)}/apercu`

function arreterSuivi(): void {
  if (minuteur) clearTimeout(minuteur)
  minuteur = null
}

/** Interroge l'état jusqu'à ce que l'application réponde (ou échoue). */
function suivre(projet: string): void {
  arreterSuivi()
  minuteur = setTimeout(async () => {
    if (props.projet !== projet) return
    try {
      apercu.value = await api.lire<Apercu>(chemin(projet))
      if (apercu.value.etat === 'demarrage') suivre(projet)
    } catch (e) {
      erreur.value = (e as Error).message
    }
  }, props.intervalleMs ?? 3000)
}

async function demarrer(projet: string): Promise<void> {
  erreur.value = null
  apercu.value = { etat: 'demarrage', url: null, journal: null }
  try {
    apercu.value = await api.envoyer<Apercu>(chemin(projet), {})
    if (apercu.value.etat === 'demarrage') suivre(projet)
  } catch (e) {
    apercu.value = null
    erreur.value = (e as Error).message
  }
}

function recharger(): void {
  cle.value++
}

watch(
  () => props.projet,
  (projet) => {
    arreterSuivi()
    apercu.value = null
    if (projet) void demarrer(projet)
  },
  { immediate: true },
)

onUnmounted(arreterSuivi)
</script>

<template>
  <section class="atelier__panneau" aria-labelledby="titre-apercu">
    <div class="fr-grid-row fr-grid-row--middle fr-grid-row--gutters">
      <h2 id="titre-apercu" class="fr-h4 fr-mb-0 fr-col">Aperçu</h2>
      <div v-if="apercu?.etat === 'pret' && apercu.url" class="fr-col-auto">
        <ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm">
          <li>
            <DsfrButton size="sm" tertiary icon="fr-icon-refresh-line" label="Recharger" @click="recharger" />
          </li>
          <li>
            <a class="fr-btn fr-btn--sm fr-btn--tertiary" :href="apercu.url" target="_blank" rel="noopener">
              Ouvrir dans un onglet<span class="fr-sr-only"> (nouvelle fenêtre)</span>
            </a>
          </li>
        </ul>
      </div>
    </div>

    <iframe
      v-if="apercu?.etat === 'pret' && apercu.url"
      :key="cle"
      class="apercu apercu--cadre"
      :src="apercu.url"
      :title="`Aperçu de l’application ${projet}`"
    />

    <div v-else class="apercu" role="status">
      <p v-if="!projet">Choisissez un projet pour afficher son aperçu.</p>
      <DsfrAlert v-else-if="erreur" type="error" small :description="erreur" />
      <div v-else-if="apercu?.etat === 'erreur'">
        <DsfrAlert
          type="error"
          small
          description="L’application ne démarre pas. Si le problème persiste, prévenez un développeur avec le journal ci-dessous."
        />
        <pre v-if="apercu.journal" class="fr-text--xs fr-mt-2w journal">{{ apercu.journal }}</pre>
        <DsfrButton class="fr-mt-2w" size="sm" label="Réessayer" @click="demarrer(projet)" />
      </div>
      <p v-else>
        Préparation de l’aperçu de « {{ projet }} »… La première fois, l’installation prend
        une à deux minutes.
      </p>
    </div>
  </section>
</template>
