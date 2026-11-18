<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import FilStory from '@/components/FilStory.vue'
import FormulairePrompt from '@/components/FormulairePrompt.vue'
import AccueilProjet from '@/components/AccueilProjet.vue'
import BarreLaterale from '@/components/BarreLaterale.vue'
import FormulaireProjet from '@/components/FormulaireProjet.vue'
import AssignationDeveloppeur from '@/components/AssignationDeveloppeur.vue'
import PanneauApercu from '@/components/PanneauApercu.vue'
import ResultatProjet from '@/components/ResultatProjet.vue'
import RepriseProjet from '@/components/RepriseProjet.vue'
import RepriseEnAttente from '@/components/RepriseEnAttente.vue'
import AnnulerReprise from '@/components/AnnulerReprise.vue'
import type { ErreursProjet, NouveauProjet, ResultatCreation } from '@/lib/projet'
import { STATUTS_ACTIFS, type StoryProposee } from '@/lib/story'
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

/** Idée de départ (#68) : le projet s'ouvre directement sur elle, où l'assistant travaille déjà. */
async function suivreIdee(numero: number): Promise<void> {
  const id = resultatProjet.value?.projet.id
  fermerCreationProjet()
  if (!id) return
  projets.choisir(id)
  await stories.charger(id)
  await stories.ouvrir(id, numero)
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
  if (typeof nom === 'string' && nom) projets.choisir(nom)
}

/** Reprise annulée ou projet désynchronisé : il n'est plus dans ADA, on revient à la liste. */
async function repriseAnnulee(): Promise<void> {
  masquerProjet()
  await projets.charger()
}

/** Masquer le projet ouvert (ex. avant de partager son écran) : il reste dans le sélecteur. */
function masquerProjet(): void {
  modePrompt.value = false
  stories.fermer()
  projets.fermer()
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

/** « Nouvelle conversation » : retour à l'accueil du projet, la zone de message prête à écrire. */
async function accueil(): Promise<void> {
  modePrompt.value = false
  stories.fermer()
  await nextTick()
  document.getElementById('message-accueil')?.focus()
}

/** Aperçu en panneau, qu'on ouvre ou ferme ; le choix est gardé sur l'appareil. */
const CLE_APERCU = 'ada:apercu-ferme'
function lireApercuFerme(): boolean {
  try {
    return localStorage.getItem(CLE_APERCU) === 'oui'
  } catch {
    return false
  }
}
const apercuOuvert = ref(!lireApercuFerme())
function basculerApercu(): void {
  apercuOuvert.value = !apercuOuvert.value
  try {
    if (apercuOuvert.value) localStorage.removeItem(CLE_APERCU)
    else localStorage.setItem(CLE_APERCU, 'oui')
  } catch {
    // stockage indisponible : le choix vaut pour cette visite
  }
}

/** Mode sauvage : formulaire « Prompter » à la place du détail d'une demande. */
const modePrompt = ref(false)
const erreurPrompt = ref<string | null>(null)

function ouvrirPrompt(): void {
  stories.fermer()
  erreurPrompt.value = null
  modePrompt.value = true
}

/** Conversation (« vrai prompt ») : le message écrit à l'accueil l'ouvre directement. */
const erreurConversation = ref<string | null>(null)

async function demarrerConversation(texte: string): Promise<void> {
  if (!projets.idCourant) return
  actionEnCours.value = true
  erreurConversation.value = null
  try {
    erreurConversation.value = await stories.ouvrirConversation(projets.idCourant, texte)
  } finally {
    actionEnCours.value = false
  }
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
const relancerControles = () => agir((p, n) => stories.relancerControles(p, n))
const repondre = (texte: string) => agir((p, n) => stories.repondre(p, n, texte))
const creerDecoupage = (proposees: StoryProposee[]) => agir((p, n) => stories.creerDecoupage(p, n, proposees))
const envoyerMessage = (texte: string) => agir((p, n) => stories.envoyerMessage(p, n, texte))
const terminerConversation = () => agir((p, n) => stories.terminerConversation(p, n))
async function arreterConversation(): Promise<void> {
  await agir((p, n) => stories.arreterConversation(p, n))
  if (!stories.erreurAction) stories.fermer()
}

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

  <div v-else-if="creationProjet" class="fr-grid-row fr-grid-row--center">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <DsfrAlert v-if="erreurProjet" type="error" small :description="erreurProjet" class="fr-mb-3w" />
      <ResultatProjet v-if="resultatProjet" :resultat="resultatProjet" @fermer="fermerCreationProjet" @suivre="suivreIdee" />
      <FormulaireProjet
        v-else
        :familles="projets.familles"
        :types="projets.types"
        :modeles="projets.modeles"
        :erreurs-serveur="erreursProjet"
        :conseiller="projets.conseillerStack"
        :envoi-en-cours="envoiEnCours"
        @soumettre="creerProjet"
        @annuler="fermerCreationProjet"
      />
    </div>
  </div>

  <div v-else-if="repriseProjet" class="fr-grid-row fr-grid-row--center">
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

  <div v-else class="atelier" :class="{ 'atelier--sans-apercu': !apercuOuvert }">
    <BarreLaterale
      class="atelier__colonne atelier__barre"
      @accueil="accueil"
      @choisir="choisirProjet"
      @ouvrir="ouvrir"
      @actualiser="actualiser"
      @nouveau-projet="nouveauProjet"
      @reprendre-projet="reprendreProjet"
      @masquer-projet="masquerProjet"
    />

    <section class="atelier__colonne atelier__centre" aria-label="Demande en cours">
      <div class="atelier__haut">
        <DsfrButton
          tertiary
          no-outline
          size="sm"
          :icon="apercuOuvert ? 'fr-icon-layout-column-line' : 'fr-icon-eye-line'"
          :label="apercuOuvert ? 'Masquer l’aperçu' : 'Afficher l’aperçu'"
          :aria-expanded="apercuOuvert ? 'true' : 'false'"
          aria-controls="panneau-apercu"
          @click="basculerApercu"
        />
      </div>

      <AnnulerReprise v-if="projets.courant && (projets.courant.reprise || projets.courant.repris)" :key="projets.courant.id" :projet="projets.courant" @fait="repriseAnnulee" />
      <RepriseEnAttente v-if="projets.courant?.reprise" :projet="projets.courant.id" @fusionnee="repriseFusionnee" />

      <p v-if="!projets.idCourant" class="atelier__vide">Choisissez un projet dans la barre de gauche.</p>
      <template v-else>
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
          @relancer-controles="relancerControles"
          @repondre="repondre"
          @creer-decoupage="creerDecoupage"
          @envoyer-message="envoyerMessage"
          @terminer-conversation="terminerConversation"
          @arreter-conversation="arreterConversation"
          @ouvrir="ouvrir"
        />
        <AccueilProjet
          v-else-if="projets.courant && !projets.courant.reprise"
          :nom-projet="projets.courant.nom"
          :stories="stories.aFaire"
          :active="stories.active"
          :envoi-en-cours="actionEnCours"
          :erreur-serveur="erreurConversation"
          @conversation="demarrerConversation"
          @ouvrir="ouvrir"
          @guidee="ouvrirPrompt"
        />
        <AssignationDeveloppeur
          v-if="!modePrompt && stories.courante && projets.idCourant"
          :projet="projets.idCourant"
          :story="stories.courante"
        />
        <DsfrAlert v-if="stories.erreurAction" type="error" small :description="stories.erreurAction" />
      </template>
    </section>

    <PanneauApercu
      v-if="apercuOuvert"
      id="panneau-apercu"
      class="atelier__colonne atelier__apercu"
      :projet="projets.idCourant"
      :en-attente="projets.courant?.reprise ? 'L’aperçu démarrera une fois la reprise validée : ADA saura alors comment lancer le projet.' : null"
    />
  </div>
</template>
