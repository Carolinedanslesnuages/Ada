<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Modele } from '@/lib/projet'
import { useProjetsStore, type DepotAReprendre } from '@/stores/projets'

/**
 * Reprendre un projet existant (#37) : le PO choisit un dépôt de l'organisation ou de son compte
 * (la stack est facultative). ADA lance l'analyse et ouvre aussitôt le projet : le PO y suit
 * l'assistant, puis valide la reprise.
 */
const props = defineProps<{ modeles: Modele[] }>()
const emit = defineEmits<{ annuler: []; lancee: [id: string, analyse: number | null] }>()
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

async function charger(): Promise<void> {
  try {
    depots.value = await projets.aReprendre()
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

onMounted(charger)

async function reprendre(): Promise<void> {
  erreurDepot.value = depot.value ? undefined : 'Choisissez le dépôt à reprendre'
  if (erreurDepot.value || choisi.value?.repriseEnCours || choisi.value?.analyseEnCours) return
  envoiEnCours.value = true
  erreur.value = null
  try {
    const resultat = await projets.reprendre(depot.value, modele.value || null, apparence.value === 'dsfr')
    const numero = Number(resultat.analyse?.match(/\/issues\/(\d+)$/)?.[1])
    emit('lancee', resultat.id, Number.isInteger(numero) ? numero : null)
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    envoiEnCours.value = false
  }
}
</script>

<template>
  <form novalidate aria-labelledby="titre-reprise" @submit.prevent="reprendre">
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

    <p v-if="envoiEnCours" class="fr-text--sm" role="status">ADA prépare la reprise et lance l’analyse…</p>
    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li v-if="depots && depots.length && !choisi?.repriseEnCours && !choisi?.analyseEnCours">
        <DsfrButton type="submit" label="Analyser et reprendre" aria-describedby="reprise-enregistrement" :disabled="envoiEnCours" />
      </li>
      <li><DsfrButton type="button" secondary label="Annuler" @click="emit('annuler')" /></li>
    </ul>
  </form>
</template>
