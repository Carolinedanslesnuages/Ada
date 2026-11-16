<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  normaliserNom,
  slugifier,
  verifierProjet,
  type ErreursProjet,
  type Modele,
  type NouveauProjet,
} from '@/lib/projet'

const props = defineProps<{
  modeles: Modele[]
  erreursServeur?: ErreursProjet | null
  envoiEnCours?: boolean
}>()
const emit = defineEmits<{ soumettre: [projet: NouveauProjet]; annuler: [] }>()

const projet = reactive<NouveauProjet>({ nom: '', objectif: '', modele: '', baseline: '' })
const erreursLocales = ref<ErreursProjet>({})
const erreurs = computed<ErreursProjet>(() => ({ ...erreursLocales.value, ...props.erreursServeur }))
const adresse = computed(() => slugifier(normaliserNom(projet.nom)))

function envoyer(): void {
  erreursLocales.value = verifierProjet(projet)
  if (Object.keys(erreursLocales.value).length > 0) return
  emit('soumettre', {
    ...projet,
    nom: normaliserNom(projet.nom),
    baseline: normaliserNom(projet.baseline),
  })
}
</script>

<template>
  <form novalidate @submit.prevent="envoyer">
    <h2 class="fr-h4">Nouveau projet</h2>
    <p class="fr-text--sm">
      Le projet est créé sur GitHub, en votre nom, prêt à recevoir sa première story. Tous les
      champs sont obligatoires, sauf la baseline.
    </p>

    <DsfrInputGroup
      v-model="projet.nom"
      label="Nom du projet"
      :hint="adresse ? `Adresse du dépôt : ${adresse}` : 'Exemple : Réservation de salles'"
      label-visible
      :error-message="erreurs.nom"
    />
    <DsfrInputGroup
      v-model="projet.baseline"
      label="Baseline (facultatif)"
      hint="Phrase courte affichée sous le nom du service dans l’en-tête. Exemple : Ma journée avec POC Portail"
      label-visible
      :error-message="erreurs.baseline"
    />
    <DsfrInputGroup
      v-model="projet.objectif"
      label="Objectif"
      hint="En une ou deux phrases : à quoi va servir ce projet, et pour qui ?"
      label-visible
      is-textarea
      :error-message="erreurs.objectif"
    />

    <fieldset
      class="fr-fieldset"
      :class="{ 'fr-fieldset--error': erreurs.modele }"
      aria-describedby="stack-aide"
    >
      <legend class="fr-fieldset__legend">Stack technique</legend>
      <p id="stack-aide" class="fr-hint-text fr-fieldset__element">
        Celle indiquée par l’équipe technique pour ce type de projet.
      </p>
      <div v-for="modele in modeles" :key="modele.id" class="fr-fieldset__element">
        <div class="fr-radio-group">
          <input
            :id="`modele-${modele.id}`"
            v-model="projet.modele"
            type="radio"
            name="modele"
            :value="modele.id"
            :disabled="!modele.depot"
          />
          <label class="fr-label" :for="`modele-${modele.id}`">
            {{ modele.libelle }}{{ modele.depot ? '' : ' (bientôt disponible)' }}
            <span class="fr-hint-text">{{ modele.pourQuoi }}</span>
          </label>
        </div>
      </div>
      <p v-if="erreurs.modele" class="fr-error-text fr-fieldset__element" role="alert">
        {{ erreurs.modele }}
      </p>
    </fieldset>

    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li>
        <DsfrButton
          type="submit"
          :label="envoiEnCours ? 'Création en cours…' : 'Créer le projet'"
          :disabled="envoiEnCours"
        />
      </li>
      <li>
        <DsfrButton type="button" secondary label="Annuler" @click="emit('annuler')" />
      </li>
    </ul>
  </form>
</template>
