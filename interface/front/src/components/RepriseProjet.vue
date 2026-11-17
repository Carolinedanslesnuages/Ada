<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Modele } from '@/lib/projet'
import { useProjetsStore, type DepotAReprendre, type ResultatReprise } from '@/stores/projets'

/**
 * Reprendre un projet existant (#37) : le PO choisit un dépôt de l'organisation ou de son compte,
 * puis la stack la plus proche ; ADA ouvre une PR « reprise par ADA » qu'il valide sur GitHub.
 */
const props = defineProps<{ modeles: Modele[] }>()
const emit = defineEmits<{ annuler: []; terminee: [] }>()
const projets = useProjetsStore()

const depots = ref<DepotAReprendre[] | null>(null)
const depot = ref('')
const modele = ref('')
const erreurs = ref<{ depot?: string; modele?: string }>({})
const erreur = ref<string | null>(null)
const envoiEnCours = ref(false)
const resultat = ref<ResultatReprise | null>(null)

const choisi = computed(() => depots.value?.find((candidat) => candidat.id === depot.value) ?? null)
const libelleCompte = (candidat: DepotAReprendre) => (candidat.compte === 'personnel' ? `votre compte ${candidat.proprietaire}` : `organisation ${candidat.proprietaire}`)
const optionsDepots = computed(() =>
  (depots.value ?? []).map((candidat) => ({ value: candidat.id, text: `${candidat.nom} (${libelleCompte(candidat)})` })),
)
const optionsModeles = computed(() => props.modeles.filter((m) => m.disponible).map((m) => ({ value: m.id, text: m.libelle })))
const pourQuoi = computed(() => props.modeles.find((m) => m.id === modele.value)?.pourQuoi ?? '')

onMounted(async () => {
  try {
    depots.value = await projets.aReprendre()
  } catch (e) {
    erreur.value = (e as Error).message
  }
})

async function reprendre(): Promise<void> {
  erreurs.value = {
    depot: depot.value ? undefined : 'Choisissez le dépôt à reprendre',
    modele: modele.value || choisi.value?.repriseEnCours ? undefined : 'Choisissez la stack la plus proche',
  }
  if (erreurs.value.depot || erreurs.value.modele || choisi.value?.repriseEnCours) return
  envoiEnCours.value = true
  erreur.value = null
  try {
    resultat.value = await projets.reprendre(depot.value, modele.value)
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    envoiEnCours.value = false
  }
}
</script>

<template>
  <section v-if="resultat" aria-labelledby="titre-reprise">
    <h2 id="titre-reprise" class="fr-h4">Reprise proposée</h2>
    <DsfrAlert
      type="success"
      title="ADA a ouvert la pull request de reprise"
      description="Relisez-la puis fusionnez-la sur GitHub. Le projet apparaîtra ensuite dans ADA, avec ses stories, son aperçu et ses versions."
      class="fr-mb-2w"
    />
    <p v-if="resultat.fichiers.length" class="fr-text--sm">Fichiers ajoutés : {{ resultat.fichiers.join(', ') }}.</p>
    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li>
        <a class="fr-btn" :href="resultat.pullRequest" target="_blank" rel="noopener">
          Ouvrir la pull request <span class="fr-sr-only">(nouvelle fenêtre)</span>
        </a>
      </li>
      <li><DsfrButton type="button" secondary label="Revenir à mes projets" @click="emit('terminee')" /></li>
    </ul>
  </section>

  <form v-else novalidate aria-labelledby="titre-reprise" @submit.prevent="reprendre">
    <h2 id="titre-reprise" class="fr-h4">Reprendre un projet existant</h2>
    <p class="fr-text--sm">
      Faites évoluer avec ADA un projet déjà commencé, de l’organisation ou de votre compte GitHub. ADA
      propose une pull request de reprise : rien ne change dans le projet tant que vous ne l’avez pas
      validée.
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
        :error-message="erreurs.depot"
        default-unselected-text="Choisissez un dépôt"
      />
      <DsfrAlert
        v-if="choisi?.repriseEnCours"
        type="info"
        small
        class="fr-mb-3w"
        description="Une reprise de ce dépôt attend déjà votre validation : fusionnez sa pull request sur GitHub."
      />
      <p v-if="choisi?.repriseEnCours" class="fr-mb-3w">
        <a :href="choisi.repriseEnCours" target="_blank" rel="noopener">
          Ouvrir la pull request de reprise <span class="fr-sr-only">(nouvelle fenêtre)</span>
        </a>
      </p>
      <template v-else>
        <DsfrSelect
          v-model="modele"
          label="Stack la plus proche"
          hint="Elle décrit à ADA comment démarrer l’aperçu du projet."
          :options="optionsModeles"
          :error-message="erreurs.modele"
          default-unselected-text="Choisissez une stack"
        />
        <p v-if="pourQuoi" class="fr-text--sm fr-mt-n2w">{{ pourQuoi }}</p>
      </template>
    </template>

    <p id="reprise-enregistrement" class="fr-text--sm">
      <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
      ADA ajoute, s’ils manquent, les formulaires de story et de signalement, la description de l’aperçu
      (<code>ada.json</code>) et les versions automatiques, à votre nom.
    </p>
    <p class="fr-text--sm">
      Votre dépôt n’apparaît pas ? ADA doit y avoir accès :
      <a href="https://github.com/settings/installations" target="_blank" rel="noopener">
        autorisez l’application ADA sur ce compte <span class="fr-sr-only">(nouvelle fenêtre)</span>
      </a>.
    </p>

    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li v-if="depots && depots.length && !choisi?.repriseEnCours">
        <DsfrButton type="submit" label="Proposer la reprise" aria-describedby="reprise-enregistrement" :disabled="envoiEnCours" />
      </li>
      <li><DsfrButton type="button" secondary label="Annuler" @click="emit('annuler')" /></li>
    </ul>
  </form>
</template>
