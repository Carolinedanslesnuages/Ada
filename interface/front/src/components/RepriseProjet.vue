<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Modele } from '@/lib/projet'
import { useProjetsStore, type DepotAReprendre, type ResultatReprise } from '@/stores/projets'

/**
 * Reprendre un projet existant (#37) : le PO choisit un dépôt de l'organisation ou de son compte
 * (la stack est facultative). L'assistant analyse le projet comme s'il avait été créé avec ADA et
 * propose des améliorations ; ADA ouvre ensuite la PR de reprise, que le PO fusionne sur GitHub.
 */
const props = defineProps<{ modeles: Modele[]; intervalleSuivi?: number }>()
const emit = defineEmits<{ annuler: []; terminee: [] }>()
const projets = useProjetsStore()

const depots = ref<DepotAReprendre[] | null>(null)
const depot = ref('')
const modele = ref('')
/** Code existant : on garde son apparence par défaut ; le DSFR est un choix explicite. */
const apparence = ref<'projet' | 'dsfr'>('projet')
const optionsApparence = [
  { label: 'Garder l’apparence du projet (sans DSFR)', value: 'projet', hint: 'L’assistant réutilise les composants et le style déjà en place.' },
  { label: 'Utiliser le DSFR', value: 'dsfr', hint: 'Système de design de l’État : l’assistant l’applique aux écrans qu’il crée ou modifie.' },
]
const erreurDepot = ref<string | undefined>()
const erreur = ref<string | null>(null)
const envoiEnCours = ref(false)
const resultat = ref<ResultatReprise | null>(null)
/** Dépôt suivi après l'envoi : l'analyse tourne, puis la PR de reprise s'ouvre. */
const suivi = ref<DepotAReprendre | null>(null)
let minuteur: ReturnType<typeof setInterval> | null = null

const choisi = computed(() => depots.value?.find((candidat) => candidat.id === depot.value) ?? null)
const libelleCompte = (candidat: DepotAReprendre) => (candidat.compte === 'personnel' ? `votre compte ${candidat.proprietaire}` : `organisation ${candidat.proprietaire}`)
const optionsDepots = computed(() =>
  (depots.value ?? []).map((candidat) => ({ value: candidat.id, text: `${candidat.nom} (${libelleCompte(candidat)})` })),
)
/** La stack décrit la structure du code ; l'apparence se choisit à part. */
const sansDsfr = (libelle: string) => libelle.replace(/,? avec DSFR$/, '').replace(/ DSFR\b/, '')
const optionsModeles = computed(() => [
  { value: '', text: 'Je ne sais pas : l’assistant la déduit' },
  ...props.modeles.filter((m) => m.disponible).map((m) => ({ value: m.id, text: sansDsfr(m.libelle) })),
])
const pullRequest = computed(() => suivi.value?.repriseEnCours ?? resultat.value?.pullRequest ?? null)
const analyseTerminee = computed(() => suivi.value !== null && !suivi.value.analyseEnCours)

async function charger(): Promise<void> {
  try {
    depots.value = await projets.aReprendre()
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

function arreterSuivi(): void {
  if (minuteur) clearInterval(minuteur)
  minuteur = null
}

async function suivre(id: string): Promise<void> {
  try {
    suivi.value = (await projets.aReprendre()).find((candidat) => candidat.id === id) ?? null
  } catch {
    return // réseau : on réessaiera au prochain tour
  }
  if (!suivi.value || suivi.value.repriseEnCours || !suivi.value.analyseEnCours) arreterSuivi()
}

onMounted(charger)
onUnmounted(arreterSuivi)

async function reprendre(): Promise<void> {
  erreurDepot.value = depot.value ? undefined : 'Choisissez le dépôt à reprendre'
  if (erreurDepot.value || choisi.value?.repriseEnCours || choisi.value?.analyseEnCours) return
  envoiEnCours.value = true
  erreur.value = null
  try {
    const id = depot.value
    resultat.value = await projets.reprendre(id, modele.value || null, apparence.value === 'dsfr')
    if (!resultat.value.pullRequest) {
      suivi.value = { ...choisi.value!, analyseEnCours: true }
      minuteur = setInterval(() => void suivre(id), props.intervalleSuivi ?? 15000)
    }
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    envoiEnCours.value = false
  }
}
</script>

<template>
  <section v-if="resultat" aria-labelledby="titre-reprise">
    <h2 id="titre-reprise" class="fr-h4">Reprise de « {{ choisi?.nom }} »</h2>
    <div role="status">
      <DsfrAlert
        v-if="pullRequest"
        type="success"
        title="La pull request de reprise est prête"
        description="Relisez-la puis fusionnez-la sur GitHub. Le projet apparaîtra ensuite dans ADA, avec les améliorations proposées par l’assistant à choisir."
        class="fr-mb-2w"
      />
      <DsfrAlert
        v-else-if="analyseTerminee"
        type="warning"
        title="L’analyse s’est arrêtée sans pull request"
        description="L’assistant explique pourquoi dans la demande d’analyse : un développeur doit sans doute intervenir."
        class="fr-mb-2w"
      />
      <DsfrAlert
        v-else
        type="info"
        title="L’assistant analyse le projet"
        description="Il le compare à un projet créé avec ADA et prépare ses propositions d’amélioration. Comptez quelques minutes : la pull request de reprise s’ouvrira ensuite, cette page se met à jour seule."
        class="fr-mb-2w"
      />
    </div>
    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li v-if="pullRequest">
        <a class="fr-btn" :href="pullRequest" target="_blank" rel="noopener">
          Ouvrir la pull request de reprise <span class="fr-sr-only">(nouvelle fenêtre)</span>
        </a>
      </li>
      <li v-if="resultat.analyse">
        <a class="fr-btn fr-btn--secondary" :href="resultat.analyse" target="_blank" rel="noopener">
          Voir l’analyse sur GitHub <span class="fr-sr-only">(nouvelle fenêtre)</span>
        </a>
      </li>
      <li><DsfrButton type="button" tertiary label="Revenir à mes projets" @click="emit('terminee')" /></li>
    </ul>
  </section>

  <form v-else novalidate aria-labelledby="titre-reprise" @submit.prevent="reprendre">
    <h2 id="titre-reprise" class="fr-h4">Reprendre un projet existant</h2>
    <p class="fr-text--sm">
      Faites évoluer avec ADA un projet déjà commencé, de l’organisation ou de votre compte GitHub.
      L’assistant l’analyse comme s’il avait été créé avec ADA et vous propose des améliorations
      (tests, accessibilité, règles du projet). ADA ouvre ensuite une pull request de reprise : rien
      ne change dans le projet tant que vous ne l’avez pas validée.
    </p>

    <DsfrAlert v-if="erreur" type="error" small :description="erreur" class="fr-mb-3w" />
    <p v-if="depots === null && !erreur" class="fr-text--sm" role="status">Recherche de vos dépôts…</p>
    <DsfrAlert
      v-else-if="depots && depots.length === 0"
      type="info"
      small
      description="Aucun dépôt à reprendre : tous ceux auxquels ADA a accès sont déjà dans l’atelier."
      class="fr-mb-3w"
    />

    <template v-if="depots && depots.length">
      <DsfrSelect
        v-model="depot"
        label="Dépôt à reprendre"
        :options="optionsDepots"
        :error-message="erreurDepot"
        default-unselected-text="Choisissez un dépôt"
      />
      <template v-if="choisi?.repriseEnCours">
        <DsfrAlert type="info" small class="fr-mb-2w" description="Une reprise de ce dépôt attend déjà votre validation : fusionnez sa pull request sur GitHub." />
        <p class="fr-mb-3w">
          <a :href="choisi.repriseEnCours" target="_blank" rel="noopener">
            Ouvrir la pull request de reprise <span class="fr-sr-only">(nouvelle fenêtre)</span>
          </a>
        </p>
      </template>
      <DsfrAlert
        v-else-if="choisi?.analyseEnCours"
        type="info"
        small
        class="fr-mb-3w"
        description="L’assistant analyse déjà ce projet : la pull request de reprise s’ouvrira à la fin."
      />
      <template v-else>
        <DsfrSelect
          v-model="modele"
          label="Stack la plus proche (facultatif)"
          hint="Si vous la connaissez, l’assistant part de sa description pour démarrer l’aperçu."
          :options="optionsModeles"
        />
        <DsfrRadioButtonSet v-model="apparence" name="apparence" legend="Apparence" :options="optionsApparence" />
      </template>
    </template>

    <p id="reprise-enregistrement" class="fr-text--sm">
      <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
      <strong>ADA enregistre la demande d’analyse sur GitHub, à votre nom</strong>, puis ajoute s’ils
      manquent les formulaires de story et de signalement, la description de l’aperçu
      (<code>ada.json</code>) et les versions automatiques.
    </p>
    <p class="fr-text--sm">
      Votre dépôt n’apparaît pas ? ADA doit y avoir accès :
      <a href="https://github.com/settings/installations" target="_blank" rel="noopener">
        autorisez l’application ADA sur ce compte <span class="fr-sr-only">(nouvelle fenêtre)</span>
      </a>.
    </p>

    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li v-if="depots && depots.length && !choisi?.repriseEnCours && !choisi?.analyseEnCours">
        <DsfrButton type="submit" label="Analyser et reprendre" aria-describedby="reprise-enregistrement" :disabled="envoiEnCours" />
      </li>
      <li><DsfrButton type="button" secondary label="Annuler" @click="emit('annuler')" /></li>
    </ul>
  </form>
</template>
