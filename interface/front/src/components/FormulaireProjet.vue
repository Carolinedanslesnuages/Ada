<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  type FamilleDeProjet,
  type TypeDeProjet,
  type TypeProjet,
  normaliserNom,
  slugifier,
  verifierProjet,
  type ErreursProjet,
  type Modele,
  type NouveauProjet,
} from '@/lib/projet'

const props = defineProps<{
  familles: FamilleDeProjet[]
  types: TypeDeProjet[]
  modeles: Modele[]
  erreursServeur?: ErreursProjet | null
  envoiEnCours?: boolean
}>()
const emit = defineEmits<{ soumettre: [projet: NouveauProjet]; annuler: [] }>()

const projet = reactive<NouveauProjet>({ nom: '', idee: '', objectif: '', modele: '', baseline: '', deploye: false })
const erreursLocales = ref<ErreursProjet>({})
const erreurs = computed<ErreursProjet>(() => ({ ...erreursLocales.value, ...props.erreursServeur }))
const adresse = computed(() => slugifier(normaliserNom(projet.nom)))

/** D'abord le type de projet, puis la stack de ce type (choisie d'office s'il n'y en a qu'une). */
const typeChoisi = ref<TypeProjet | null>(null)
/** Seuls les modèles livrés sont proposés : rien « en attente de développement » à l'écran. */
const modelesDisponibles = computed(() => props.modeles.filter((modele) => modele.disponible))
const modelesDuType = computed(() => modelesDisponibles.value.filter((modele) => modele.type === typeChoisi.value))
/** Types qui ont au moins un modèle livré, regroupés par famille (familles vides omises). */
const famillesAvecTypes = computed(() =>
  props.familles
    .map((famille) => ({
      ...famille,
      types: props.types.filter(
        (type) => type.famille === famille.id && modelesDisponibles.value.some((modele) => modele.type === type.id),
      ),
    }))
    .filter((famille) => famille.types.length > 0),
)
watch(typeChoisi, () => {
  projet.modele = modelesDuType.value.length === 1 ? modelesDuType.value[0]!.id : ''
})

const modeleChoisi = computed(() => props.modeles.find((modele) => modele.id === projet.modele) ?? null)
watch(modeleChoisi, (modele) => {
  if (!modele?.deployable) projet.deploye = false
})

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
      Racontez votre idée : ADA crée le projet sur GitHub, en votre nom, et l’assistant s’en
      saisit aussitôt. L’objectif et la baseline sont facultatifs.
    </p>

    <DsfrInputGroup
      v-model="projet.nom"
      label="Nom du projet"
      :hint="adresse ? `Adresse du dépôt : ${adresse}` : 'Exemple : Réservation de salles'"
      label-visible
      :error-message="erreurs.nom"
    />
    <DsfrInputGroup
      v-model="projet.idee"
      label="Votre idée"
      hint="Racontez-la comme elle vient, même en vrac : le besoin, pour qui, ce qui vous gêne aujourd’hui… L’assistant vous posera ses questions, puis vous proposera les premières stories à valider."
      label-visible
      is-textarea
      rows="6"
      :error-message="erreurs.idee"
    />
    <DsfrInputGroup
      v-model="projet.objectif"
      label="Objectif en une phrase (facultatif)"
      hint="Si vous savez déjà le dire. Sinon, ADA reprend la première phrase de votre idée."
      label-visible
      is-textarea
      :error-message="erreurs.objectif"
    />
    <DsfrInputGroup
      v-model="projet.baseline"
      label="Baseline (facultatif)"
      hint="Phrase courte affichée sous le nom du service dans l’en-tête. Exemple : Ma journée avec POC Portail"
      label-visible
      :error-message="erreurs.baseline"
    />

    <fieldset class="fr-fieldset" :class="{ 'fr-fieldset--error': erreurs.modele && !typeChoisi }">
      <legend class="fr-fieldset__legend">Que voulez-vous créer ?</legend>
      <div v-for="famille in famillesAvecTypes" :key="famille.id" class="fr-fieldset__element">
        <fieldset class="fr-fieldset">
          <legend class="fr-fieldset__legend fr-fieldset__legend--regular fr-text--bold">
            {{ famille.libelle }}
          </legend>
          <div v-for="type in famille.types" :key="type.id" class="fr-fieldset__element">
            <div class="fr-radio-group">
              <input
                :id="`type-${type.id}`"
                v-model="typeChoisi"
                type="radio"
                name="type-projet"
                :value="type.id"
              />
              <label class="fr-label" :for="`type-${type.id}`">
                {{ type.libelle }}
                <span class="fr-hint-text">{{ type.description }}</span>
              </label>
            </div>
          </div>
        </fieldset>
      </div>
    </fieldset>

    <fieldset
      v-if="typeChoisi"
      class="fr-fieldset"
      :class="{ 'fr-fieldset--error': erreurs.modele }"
      aria-describedby="stack-aide"
    >
      <legend class="fr-fieldset__legend">Stack technique</legend>
      <p id="stack-aide" class="fr-hint-text fr-fieldset__element">
        Celle indiquée par l’équipe technique pour ce type de projet.
      </p>
      <div v-for="modele in modelesDuType" :key="modele.id" class="fr-fieldset__element">
        <div class="fr-radio-group">
          <input
            :id="`modele-${modele.id}`"
            v-model="projet.modele"
            type="radio"
            name="modele"
            :value="modele.id"
          />
          <label class="fr-label" :for="`modele-${modele.id}`">
            {{ modele.libelle }}
            <span class="fr-hint-text">{{ modele.pourQuoi }}</span>
          </label>
        </div>
      </div>
      <p v-if="erreurs.modele" class="fr-error-text fr-fieldset__element" role="alert">
        {{ erreurs.modele }}
      </p>
    </fieldset>
    <p v-else-if="erreurs.modele" class="fr-error-text" role="alert">Choisissez ce que vous voulez créer</p>

    <div v-if="modeleChoisi?.deployable" class="fr-fieldset__element fr-mb-3w">
      <div class="fr-checkbox-group">
        <input id="projet-deploye" v-model="projet.deploye" type="checkbox" aria-describedby="projet-deploye-aide" />
        <label class="fr-label" for="projet-deploye">
          Ce projet sera déployé (mis en ligne)
          <span id="projet-deploye-aide" class="fr-hint-text">
            ADA ajoute de quoi l’héberger : un chart Helm, vérifié à chaque demande. L’équipe
            infra fournit ensuite l’adresse et le registre. Modifiable plus tard par un développeur.
          </span>
        </label>
      </div>
    </div>

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
