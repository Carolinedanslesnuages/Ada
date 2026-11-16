<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import FilStory from '@/components/FilStory.vue'
import FormulaireStory from '@/components/FormulaireStory.vue'
import ListeStories from '@/components/ListeStories.vue'
import PanneauApercu from '@/components/PanneauApercu.vue'
import type { ErreursStory, NouvelleStory } from '@/lib/story'
import { useProjetsStore } from '@/stores/projets'
import { useStoriesStore } from '@/stores/stories'

const projets = useProjetsStore()
const stories = useStoriesStore()

const modeCreation = ref(false)
const erreursCreation = ref<ErreursStory | null>(null)
const envoiEnCours = ref(false)

const options = computed(() => projets.liste.map((p) => ({ value: p.nom, text: p.nom })))

watch(
  () => projets.nomCourant,
  (nom) => {
    modeCreation.value = false
    if (nom) void stories.charger(nom)
  },
)

onMounted(async () => {
  await projets.charger()
  if (projets.nomCourant) await stories.charger(projets.nomCourant)
})

function choisirProjet(nom: string | number | null | undefined): void {
  if (typeof nom === 'string') projets.choisir(nom)
}

async function ouvrir(numero: number): Promise<void> {
  modeCreation.value = false
  if (projets.nomCourant) await stories.ouvrir(projets.nomCourant, numero)
}

function nouvelleStory(): void {
  stories.fermer()
  erreursCreation.value = null
  modeCreation.value = true
}

async function creer(story: NouvelleStory): Promise<void> {
  if (!projets.nomCourant) return
  envoiEnCours.value = true
  try {
    erreursCreation.value = await stories.creer(projets.nomCourant, story)
    if (!erreursCreation.value) modeCreation.value = false
  } finally {
    envoiEnCours.value = false
  }
}

async function repondre(texte: string): Promise<void> {
  if (projets.nomCourant && stories.courante) {
    await stories.repondre(projets.nomCourant, stories.courante.numero, texte)
  }
}
</script>

<template>
  <h1 class="fr-sr-only">Atelier</h1>

  <DsfrAlert v-if="projets.erreur" type="error" title="Projets indisponibles" :description="projets.erreur" />

  <DsfrAlert
    v-else-if="!projets.chargement && projets.liste.length === 0"
    type="info"
    title="Aucun projet pour l’instant"
    description="La création de projet depuis l’atelier arrive à une prochaine étape."
  />

  <div v-else class="atelier">
    <section class="atelier__panneau" aria-labelledby="titre-stories">
      <DsfrSelect
        :model-value="projets.nomCourant ?? undefined"
        label="Projet"
        :options="options"
        @update:model-value="choisirProjet"
      />

      <div class="fr-grid-row fr-grid-row--middle fr-grid-row--gutters">
        <h2 id="titre-stories" class="fr-h5 fr-col fr-mb-0">Stories</h2>
        <div class="fr-col-auto">
          <DsfrButton size="sm" icon="fr-icon-add-line" label="Nouvelle story" @click="nouvelleStory" />
        </div>
      </div>

      <p v-if="stories.chargement">Chargement des stories…</p>
      <DsfrAlert v-else-if="stories.erreur" type="error" small :description="stories.erreur" />
      <p v-else-if="stories.liste.length === 0 && !modeCreation" class="fr-text--sm">
        Aucune story dans ce projet. Créez la première !
      </p>
      <ListeStories
        v-else
        :stories="stories.liste"
        :numero-courant="stories.courante?.numero ?? null"
        @ouvrir="ouvrir"
      />

      <FormulaireStory
        v-if="modeCreation"
        :erreurs-serveur="erreursCreation"
        :envoi-en-cours="envoiEnCours"
        @soumettre="creer"
        @annuler="modeCreation = false"
      />
      <FilStory v-else-if="stories.courante" :story="stories.courante" @repondre="repondre" />
    </section>

    <PanneauApercu :projet="projets.nomCourant" />
  </div>
</template>
