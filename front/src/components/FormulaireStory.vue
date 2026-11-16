<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CRITERES_MAX, verifierStory, type ErreursStory, type NouvelleStory } from '@/lib/story'

const props = defineProps<{ erreursServeur?: ErreursStory | null; envoiEnCours?: boolean }>()
const emit = defineEmits<{ soumettre: [story: NouvelleStory]; annuler: [] }>()

const story = reactive<NouvelleStory>({
  titre: '',
  role: '',
  besoin: '',
  benefice: '',
  criteres: [''],
})
const erreursLocales = ref<ErreursStory>({})
const erreurs = computed<ErreursStory>(() => ({ ...erreursLocales.value, ...props.erreursServeur }))
const maximumAtteint = computed(() => story.criteres.length >= CRITERES_MAX)

function ajouterCritere(): void {
  if (!maximumAtteint.value) story.criteres.push('')
}

function retirerCritere(index: number): void {
  story.criteres.splice(index, 1)
  if (story.criteres.length === 0) story.criteres.push('')
}

function envoyer(): void {
  erreursLocales.value = verifierStory(story)
  if (Object.keys(erreursLocales.value).length > 0) return
  emit('soumettre', {
    ...story,
    criteres: story.criteres.map((c) => c.trim()).filter(Boolean),
  })
}
</script>

<template>
  <form novalidate @submit.prevent="envoyer">
    <h2 class="fr-h4">Nouvelle story</h2>
    <p class="fr-text--sm">
      Une story = un besoin, sur un seul écran ou un seul parcours. Tous les champs sont
      obligatoires.
    </p>

    <DsfrInputGroup
      v-model="story.titre"
      label="Titre court"
      hint="Exemple : Voir les salles libres"
      label-visible
      :error-message="erreurs.titre"
    />
    <DsfrInputGroup
      v-model="story.role"
      label="En tant que…"
      hint="Qui a ce besoin ? Exemple : agent d’accueil"
      label-visible
      :error-message="erreurs.role"
    />
    <DsfrInputGroup
      v-model="story.besoin"
      label="Je veux…"
      hint="Ce que la personne veut pouvoir faire"
      label-visible
      is-textarea
      :error-message="erreurs.besoin"
    />
    <DsfrInputGroup
      v-model="story.benefice"
      label="Afin de…"
      hint="À quoi ça lui sert"
      label-visible
      is-textarea
      :error-message="erreurs.benefice"
    />

    <fieldset class="fr-fieldset" aria-describedby="criteres-aide">
      <legend class="fr-fieldset__legend">Critères d’acceptation</legend>
      <p id="criteres-aide" class="fr-hint-text fr-fieldset__element">
        Comment saura-t-on que c’est réussi ? {{ CRITERES_MAX }} critères au maximum
        ({{ story.criteres.length }} / {{ CRITERES_MAX }}).
      </p>
      <div
        v-for="(_, index) in story.criteres"
        :key="index"
        class="fr-fieldset__element critere"
      >
        <DsfrInputGroup
          v-model="story.criteres[index]"
          :label="`Critère ${index + 1}`"
          label-visible
          wrapper-class="critere__champ"
        />
        <DsfrButton
          type="button"
          tertiary
          size="sm"
          icon="fr-icon-delete-line"
          icon-only
          :label="`Retirer le critère ${index + 1}`"
          @click="retirerCritere(index)"
        />
      </div>
      <p v-if="erreurs.criteres" class="fr-error-text fr-fieldset__element" role="alert">
        {{ erreurs.criteres }}
      </p>
      <div class="fr-fieldset__element">
        <DsfrButton
          type="button"
          secondary
          size="sm"
          icon="fr-icon-add-line"
          label="Ajouter un critère"
          :disabled="maximumAtteint"
          @click="ajouterCritere"
        />
        <p v-if="maximumAtteint" class="fr-hint-text fr-mt-1w">
          Maximum atteint : si vous avez besoin de plus de critères, découpez en plusieurs
          stories.
        </p>
      </div>
    </fieldset>

    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li>
        <DsfrButton type="submit" label="Créer la story" :disabled="envoiEnCours" />
      </li>
      <li>
        <DsfrButton type="button" secondary label="Annuler" @click="emit('annuler')" />
      </li>
    </ul>
  </form>
</template>

<style scoped>
.critere {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.critere :deep(.critere__champ) {
  flex: 1;
}
</style>
