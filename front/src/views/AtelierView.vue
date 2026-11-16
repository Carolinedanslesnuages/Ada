<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import FilStory from '@/components/FilStory.vue'
import FormulaireProjet from '@/components/FormulaireProjet.vue'
import ListeStories from '@/components/ListeStories.vue'
import PanneauApercu from '@/components/PanneauApercu.vue'
import ResultatProjet from '@/components/ResultatProjet.vue'
import type { ErreursProjet, NouveauProjet, ResultatCreation } from '@/lib/projet'
import { lienNouvelleIssue } from '@/lib/story'
import { useProjetsStore } from '@/stores/projets'
import { useStoriesStore } from '@/stores/stories'

const projets = useProjetsStore()
const stories = useStoriesStore()

const envoiEnCours = ref(false)
const lancementEnCours = ref(false)

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
    if (nom) void stories.charger(nom)
  },
)

/** Les stories s'écrivent dans GitHub : on relit la liste au retour sur l'onglet de l'atelier. */
function actualiser(): void {
  if (projets.nomCourant && !creationProjet.value) void stories.charger(projets.nomCourant, true)
}

onMounted(async () => {
  await projets.charger()
  if (projets.nomCourant) await stories.charger(projets.nomCourant)
  window.addEventListener('focus', actualiser)
})

onUnmounted(() => window.removeEventListener('focus', actualiser))

function choisirProjet(nom: string | number | null | undefined): void {
  if (typeof nom === 'string') projets.choisir(nom)
}

async function ouvrir(numero: number): Promise<void> {
  if (projets.nomCourant) await stories.ouvrir(projets.nomCourant, numero)
}

async function lancer(): Promise<void> {
  if (!projets.nomCourant || !stories.courante) return
  lancementEnCours.value = true
  try {
    await stories.lancer(projets.nomCourant, stories.courante.numero)
  } finally {
    lancementEnCours.value = false
  }
}

const autreEnCours = computed(() =>
  stories.active && stories.active.numero !== stories.courante?.numero ? stories.active : null,
)

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
          <DsfrButton size="sm" tertiary icon="fr-icon-refresh-line" label="Actualiser" @click="actualiser" />
        </div>
      </div>

      <ul v-if="projets.courant" class="fr-btns-group fr-btns-group--inline fr-btns-group--sm fr-btns-group--icon-left">
        <li>
          <a
            class="fr-btn fr-btn--sm fr-icon-edit-line"
            :href="lienNouvelleIssue(projets.courant.url, 'user-story.yml')"
            target="_blank"
            rel="noopener"
          >
            Écrire une story sur GitHub<span class="fr-sr-only"> (nouvelle fenêtre)</span>
          </a>
        </li>
        <li>
          <a
            class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-error-warning-line"
            :href="lienNouvelleIssue(projets.courant.url, 'bug.yml')"
            target="_blank"
            rel="noopener"
          >
            Signaler un problème sur GitHub<span class="fr-sr-only"> (nouvelle fenêtre)</span>
          </a>
        </li>
      </ul>

      <p v-if="stories.chargement">Chargement des stories…</p>
      <DsfrAlert v-else-if="stories.erreur" type="error" small :description="stories.erreur" />
      <p v-else-if="stories.liste.length === 0" class="fr-text--sm">
        Aucune story pour l’instant. Écrivez-la sur GitHub, puis revenez ici : elle apparaîtra
        dans la liste.
      </p>
      <ListeStories
        v-else
        :stories="stories.liste"
        :numero-courant="stories.courante?.numero ?? null"
        @ouvrir="ouvrir"
      />

      <FilStory
        v-if="stories.courante"
        :story="stories.courante"
        :autre-en-cours="autreEnCours"
        :erreur-lancement="stories.erreurLancement"
        :lancement-en-cours="lancementEnCours"
        @lancer="lancer"
        @repondre="repondre"
      />
    </section>

    <PanneauApercu :projet="projets.nomCourant" />
  </div>
</template>
