<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import FilStory from '@/components/FilStory.vue'
import FormulaireBug from '@/components/FormulaireBug.vue'
import FormulaireProjet from '@/components/FormulaireProjet.vue'
import FormulaireStory from '@/components/FormulaireStory.vue'
import ListeStories from '@/components/ListeStories.vue'
import PanneauApercu from '@/components/PanneauApercu.vue'
import ResultatProjet from '@/components/ResultatProjet.vue'
import type { ErreursProjet, NouveauProjet, ResultatCreation } from '@/lib/projet'
import type { ErreursBug, ErreursStory, NouveauBug, NouvelleStory } from '@/lib/story'
import { useProjetsStore } from '@/stores/projets'
import { useStoriesStore } from '@/stores/stories'

const projets = useProjetsStore()
const stories = useStoriesStore()

const modeCreation = ref<'story' | 'bug' | null>(null)
const erreursCreation = ref<ErreursStory | null>(null)
const erreursSignalement = ref<ErreursBug | null>(null)
const envoiEnCours = ref(false)

/** Création de projet : formulaire, puis écran de résultat avec les réglages GitHub. */
const creationProjet = ref(false)
const erreursProjet = ref<ErreursProjet | null>(null)
const resultatProjet = ref<ResultatCreation | null>(null)
const erreurProjet = ref<string | null>(null)

async function nouveauProjet(): Promise<void> {
  erreursProjet.value = null
  erreurProjet.value = null
  resultatProjet.value = null
  creationProjet.value = true
  try {
    await projets.chargerModeles()
  } catch (e) {
    erreurProjet.value = (e as Error).message
  }
}

async function creerProjet(projet: NouveauProjet): Promise<void> {
  envoiEnCours.value = true
  erreurProjet.value = null
  try {
    const reponse = await projets.creer(projet)
    if ('erreurs' in reponse) erreursProjet.value = reponse.erreurs
    else resultatProjet.value = reponse.resultat
  } catch (e) {
    erreurProjet.value = (e as Error).message
  } finally {
    envoiEnCours.value = false
  }
}

function fermerCreationProjet(): void {
  creationProjet.value = false
  resultatProjet.value = null
}

const options = computed(() => projets.liste.map((p) => ({ value: p.nom, text: p.nom })))

watch(
  () => projets.nomCourant,
  (nom) => {
    modeCreation.value = null
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
  modeCreation.value = null
  if (projets.nomCourant) await stories.ouvrir(projets.nomCourant, numero)
}

function nouvelleStory(): void {
  stories.fermer()
  erreursCreation.value = null
  modeCreation.value = 'story'
}

function nouveauSignalement(): void {
  stories.fermer()
  erreursSignalement.value = null
  modeCreation.value = 'bug'
}

async function signaler(bug: NouveauBug): Promise<void> {
  if (!projets.nomCourant) return
  envoiEnCours.value = true
  try {
    erreursSignalement.value = await stories.signaler(projets.nomCourant, bug)
    if (!erreursSignalement.value) modeCreation.value = null
  } finally {
    envoiEnCours.value = false
  }
}

async function creer(story: NouvelleStory): Promise<void> {
  if (!projets.nomCourant) return
  envoiEnCours.value = true
  try {
    erreursCreation.value = await stories.creer(projets.nomCourant, story)
    if (!erreursCreation.value) modeCreation.value = null
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

  <div v-else-if="creationProjet" class="fr-grid-row">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <DsfrAlert v-if="erreurProjet" type="error" small :description="erreurProjet" class="fr-mb-3w" />
      <ResultatProjet v-if="resultatProjet" :resultat="resultatProjet" @fermer="fermerCreationProjet" />
      <FormulaireProjet
        v-else
        :modeles="projets.modeles"
        :erreurs-serveur="erreursProjet"
        :envoi-en-cours="envoiEnCours"
        @soumettre="creerProjet"
        @annuler="fermerCreationProjet"
      />
    </div>
  </div>

  <div v-else-if="!projets.chargement && projets.liste.length === 0" class="fr-grid-row">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <DsfrAlert
        type="info"
        title="Aucun projet pour l’instant"
        description="Créez votre premier projet : il sera prêt sur GitHub en quelques secondes."
        class="fr-mb-3w"
      />
      <DsfrButton icon="fr-icon-add-line" label="Nouveau projet" @click="nouveauProjet" />
    </div>
  </div>

  <div v-else class="atelier">
    <section class="atelier__panneau" aria-labelledby="titre-stories">
      <div class="fr-grid-row fr-grid-row--bottom fr-grid-row--gutters">
        <div class="fr-col">
          <DsfrSelect
            :model-value="projets.nomCourant ?? undefined"
            label="Projet"
            :options="options"
            @update:model-value="choisirProjet"
          />
        </div>
        <div class="fr-col-auto fr-mb-3w">
          <DsfrButton size="sm" tertiary icon="fr-icon-add-line" label="Nouveau projet" @click="nouveauProjet" />
        </div>
      </div>

      <div class="fr-grid-row fr-grid-row--middle fr-grid-row--gutters">
        <h2 id="titre-stories" class="fr-h5 fr-col fr-mb-0">Stories</h2>
        <div class="fr-col-auto">
          <ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm">
            <li>
              <DsfrButton size="sm" icon="fr-icon-add-line" label="Nouvelle story" @click="nouvelleStory" />
            </li>
            <li>
              <DsfrButton
                size="sm"
                secondary
                icon="fr-icon-error-warning-line"
                label="Signaler un problème"
                @click="nouveauSignalement"
              />
            </li>
          </ul>
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
        v-if="modeCreation === 'story'"
        :erreurs-serveur="erreursCreation"
        :envoi-en-cours="envoiEnCours"
        @soumettre="creer"
        @annuler="modeCreation = null"
      />
      <FormulaireBug
        v-else-if="modeCreation === 'bug'"
        :erreurs-serveur="erreursSignalement"
        :envoi-en-cours="envoiEnCours"
        @soumettre="signaler"
        @annuler="modeCreation = null"
      />
      <FilStory v-else-if="stories.courante" :story="stories.courante" @repondre="repondre" />
    </section>

    <PanneauApercu :projet="projets.nomCourant" />
  </div>
</template>
