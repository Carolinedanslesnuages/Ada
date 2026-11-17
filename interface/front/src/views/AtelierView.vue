<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import FilStory from '@/components/FilStory.vue'
import FormulairePrompt from '@/components/FormulairePrompt.vue'
import FormulaireProjet from '@/components/FormulaireProjet.vue'
import ListeStories from '@/components/ListeStories.vue'
import AssignationDeveloppeur from '@/components/AssignationDeveloppeur.vue'
import StoriesLivrees from '@/components/StoriesLivrees.vue'
import PanneauApercu from '@/components/PanneauApercu.vue'
import PanneauVersions from '@/components/PanneauVersions.vue'
import ResultatProjet from '@/components/ResultatProjet.vue'
import RepriseProjet from '@/components/RepriseProjet.vue'
import RepriseEnAttente from '@/components/RepriseEnAttente.vue'
import type { ErreursProjet, NouveauProjet, ResultatCreation } from '@/lib/projet'
import { lienNouvelleIssue, STATUTS_ACTIFS, type StoryProposee } from '@/lib/story'
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

/** Reprise d'un projet existant (#37) : ADA ouvre une PR que le PO valide sur GitHub. */
const repriseProjet = ref(false)

async function reprendreProjet(): Promise<void> {
  erreurProjet.value = null
  repriseProjet.value = true
  try {
    await projets.chargerModeles()
  } catch (e) {
    erreurProjet.value = (e as Error).message
  }
}

function fermerRepriseProjet(): void {
  repriseProjet.value = false
  void projets.charger()
}

/** Analyse lancée : le projet repris s'ouvre aussitôt, le PO y suit l'assistant. */
async function repriseLancee(id: string, analyse: number | null): Promise<void> {
  repriseProjet.value = false
  await projets.charger()
  projets.choisir(id)
  await stories.charger(id)
  if (analyse) await stories.ouvrir(id, analyse)
}

async function repriseFusionnee(): Promise<void> {
  await projets.charger()
  if (projets.idCourant) await stories.charger(projets.idCourant)
}

const options = computed(() =>
  projets.liste.map((p) => ({
    value: p.id,
    text: [p.nom, p.compte === 'personnel' ? '(votre compte)' : '', p.reprise ? '— reprise à valider' : ''].filter(Boolean).join(' '),
  })),
)

watch(
  () => projets.idCourant,
  (nom) => {
    if (nom) void stories.charger(nom)
  },
)

/** Les stories s'écrivent dans GitHub : on relit la liste au retour sur l'onglet de l'atelier. */
function actualiser(): void {
  if (projets.idCourant && !creationProjet.value) void stories.charger(projets.idCourant, true)
}

onMounted(async () => {
  await projets.charger()
  if (projets.idCourant) await stories.charger(projets.idCourant)
  window.addEventListener('focus', actualiser)
})

onUnmounted(() => window.removeEventListener('focus', actualiser))

function choisirProjet(nom: string | number | null | undefined): void {
  if (typeof nom === 'string') projets.choisir(nom)
}

async function ouvrir(numero: number): Promise<void> {
  modePrompt.value = false
  if (projets.idCourant) await stories.ouvrir(projets.idCourant, numero)
}

async function lancer(): Promise<void> {
  if (!projets.idCourant || !stories.courante) return
  lancementEnCours.value = true
  try {
    await stories.lancer(projets.idCourant, stories.courante.numero)
  } finally {
    lancementEnCours.value = false
  }
}

const autreEnCours = computed(() =>
  stories.active && stories.active.numero !== stories.courante?.numero ? stories.active : null,
)

const actionEnCours = ref(false)

/** Mode sauvage : formulaire « Prompter » à la place du détail d'une demande. */
const modePrompt = ref(false)
const erreurPrompt = ref<string | null>(null)

function ouvrirPrompt(): void {
  stories.fermer()
  erreurPrompt.value = null
  modePrompt.value = true
}

async function prompter(texte: string): Promise<void> {
  if (!projets.idCourant) return
  actionEnCours.value = true
  try {
    erreurPrompt.value = await stories.prompter(projets.idCourant, texte)
    if (!erreurPrompt.value) modePrompt.value = false
  } finally {
    actionEnCours.value = false
  }
}

async function agir(action: (projet: string, numero: number) => Promise<void>): Promise<void> {
  if (!projets.idCourant || !stories.courante) return
  actionEnCours.value = true
  try {
    await action(projets.idCourant, stories.courante.numero)
  } finally {
    actionEnCours.value = false
  }
}

const valider = () => agir((p, n) => stories.validerPlan(p, n))
const relancer = () => agir((p, n) => stories.relancer(p, n))
const fusionner = () => agir((p, n) => stories.fusionner(p, n))
const repondre = (texte: string) => agir((p, n) => stories.repondre(p, n, texte))
const creerDecoupage = (proposees: StoryProposee[]) => agir((p, n) => stories.creerDecoupage(p, n, proposees))

/** Suivi automatique tant que la demande ouverte est active ou que l'assistant travaille. */
let minuteurSuivi: ReturnType<typeof setInterval> | null = null
watch(
  () => [stories.courante?.numero, stories.courante?.statut, stories.activite?.enCours] as const,
  ([numero, statut, travaille]) => {
    if (minuteurSuivi) clearInterval(minuteurSuivi)
    minuteurSuivi = null
    const actif = statut !== undefined && STATUTS_ACTIFS.includes(statut)
    if (numero && (actif || travaille)) {
      if (projets.idCourant && stories.activite === null) void stories.chargerActivite(projets.idCourant, numero)
      if (projets.idCourant && statut === 'en-verification') void stories.chargerVerification(projets.idCourant, numero)
      minuteurSuivi = setInterval(() => {
        if (projets.idCourant) void stories.suivre(projets.idCourant)
      }, 4000)
    }
  },
)
onUnmounted(() => {
  if (minuteurSuivi) clearInterval(minuteurSuivi)
})
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
        :familles="projets.familles"
        :types="projets.types"
        :modeles="projets.modeles"
        :erreurs-serveur="erreursProjet"
        :envoi-en-cours="envoiEnCours"
        @soumettre="creerProjet"
        @annuler="fermerCreationProjet"
      />
    </div>
  </div>

  <div v-else-if="repriseProjet" class="fr-grid-row">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <DsfrAlert v-if="erreurProjet" type="error" small :description="erreurProjet" class="fr-mb-3w" />
      <RepriseProjet :modeles="projets.modeles" @annuler="fermerRepriseProjet" @lancee="repriseLancee" />
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
      <ul class="fr-btns-group fr-btns-group--inline-md">
        <li><DsfrButton icon="fr-icon-add-line" label="Nouveau projet" @click="nouveauProjet" /></li>
        <li><DsfrButton secondary icon="fr-icon-download-line" label="Reprendre un projet existant" @click="reprendreProjet" /></li>
      </ul>
    </div>
  </div>

  <div v-else class="atelier">
    <section class="atelier__panneau" aria-labelledby="titre-stories">
      <div class="fr-grid-row fr-grid-row--bottom fr-grid-row--gutters">
        <div class="fr-col">
          <DsfrSelect
            :model-value="projets.idCourant ?? undefined"
            label="Projet"
            :options="options"
            @update:model-value="choisirProjet"
          />
        </div>
        <div class="fr-col-auto fr-mb-3w">
          <DsfrButton size="sm" tertiary icon="fr-icon-add-line" label="Nouveau projet" @click="nouveauProjet" />
          <DsfrButton size="sm" tertiary icon="fr-icon-download-line" label="Reprendre un projet" class="fr-ml-1w" @click="reprendreProjet" />
        </div>
      </div>

      <RepriseEnAttente v-if="projets.courant?.reprise" :projet="projets.courant.id" @fusionnee="repriseFusionnee" />
      <PanneauVersions v-else-if="projets.idCourant" :projet="projets.idCourant" />

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
        <li>
          <DsfrButton
            size="sm"
            tertiary
            icon="fr-icon-chat-3-line"
            label="Prompter"
            :disabled="Boolean(stories.active)"
            :title="stories.active ? 'Une demande est déjà en cours : une seule à la fois' : 'Mode libre : un petit changement sans story'"
            @click="ouvrirPrompt"
          />
        </li>
      </ul>

      <p v-if="stories.chargement">Chargement des stories…</p>
      <DsfrAlert v-else-if="stories.erreur" type="error" small :description="stories.erreur" />
      <template v-else>
        <p v-if="stories.aFaire.length === 0" class="fr-text--sm">
          Aucune story pour l’instant. Écrivez-la sur GitHub, puis revenez ici : elle apparaîtra
          dans la liste.
        </p>
        <ListeStories
          v-else
          :stories="stories.aFaire"
          :numero-courant="stories.courante?.numero ?? null"
          @ouvrir="ouvrir"
        />
        <StoriesLivrees
          v-if="stories.livrees.length > 0 && projets.courant"
          :stories="stories.livrees"
          :url-depot="projets.courant.url"
          :numero-courant="stories.courante?.numero ?? null"
          @ouvrir="ouvrir"
        />
      </template>

      <FormulairePrompt
        v-if="modePrompt"
        :envoi-en-cours="actionEnCours"
        :erreur-serveur="erreurPrompt"
        @soumettre="prompter"
        @annuler="modePrompt = false"
      />
      <FilStory
        v-else-if="stories.courante"
        :story="stories.courante"
        :autre-en-cours="autreEnCours"
        :erreur-lancement="stories.erreurLancement"
        :lancement-en-cours="lancementEnCours"
        :activite="stories.activite"
        :verification="stories.verification"
        :action-en-cours="actionEnCours"
        @lancer="lancer"
        @valider="valider"
        @relancer="relancer"
        @fusionner="fusionner"
        @repondre="repondre"
        @creer-decoupage="creerDecoupage"
        @ouvrir="ouvrir"
      />
      <AssignationDeveloppeur
        v-if="!modePrompt && stories.courante && projets.idCourant"
        :projet="projets.idCourant"
        :story="stories.courante"
      />
      <DsfrAlert v-if="stories.erreurAction" type="error" small :description="stories.erreurAction" />
    </section>

    <PanneauApercu
      :projet="projets.idCourant"
      :en-attente="projets.courant?.reprise ? 'L’aperçu démarrera une fois la reprise validée : ADA saura alors comment lancer le projet.' : null"
    />
  </div>
</template>
