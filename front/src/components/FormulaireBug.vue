<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { verifierBug, type ErreursBug, type NouveauBug } from '@/lib/story'

const props = defineProps<{ erreursServeur?: ErreursBug | null; envoiEnCours?: boolean }>()
const emit = defineEmits<{ soumettre: [bug: NouveauBug]; annuler: [] }>()

const bug = reactive<NouveauBug>({ titre: '', constate: '', attendu: '', etapes: '', ecran: '' })
const erreursLocales = ref<ErreursBug>({})
const erreurs = computed<ErreursBug>(() => ({ ...erreursLocales.value, ...props.erreursServeur }))

function envoyer(): void {
  erreursLocales.value = verifierBug(bug)
  if (Object.keys(erreursLocales.value).length > 0) return
  emit('soumettre', {
    titre: bug.titre.trim(),
    constate: bug.constate.trim(),
    attendu: bug.attendu.trim(),
    etapes: bug.etapes.trim(),
    ecran: bug.ecran.trim(),
  })
}
</script>

<template>
  <form novalidate @submit.prevent="envoyer">
    <h2 class="fr-h4">Signaler un problème</h2>
    <p class="fr-text--sm">
      Quelque chose ne marche pas comme prévu ? Décrivez-le : l’assistant cherchera la cause et
      prouvera la correction par un test. Les champs sont obligatoires, sauf l’écran.
    </p>
    <DsfrInputGroup
      v-model="bug.titre"
      label="Titre court"
      hint="Exemple : La liste des salles est vide le lundi"
      label-visible
      :error-message="erreurs.titre"
    />
    <DsfrInputGroup
      v-model="bug.constate"
      label="Ce qui se passe"
      hint="Ce que vous voyez, tel quel (message d’erreur, écran…)"
      label-visible
      is-textarea
      :error-message="erreurs.constate"
    />
    <DsfrInputGroup
      v-model="bug.attendu"
      label="Ce qui devrait se passer"
      label-visible
      is-textarea
      :error-message="erreurs.attendu"
    />
    <DsfrInputGroup
      v-model="bug.etapes"
      label="Comment le reproduire"
      hint="Les étapes, une par ligne"
      label-visible
      is-textarea
      :error-message="erreurs.etapes"
    />
    <DsfrInputGroup
      v-model="bug.ecran"
      label="Écran ou adresse concerné (facultatif)"
      hint="Exemple : /salles-libres"
      label-visible
    />
    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li>
        <DsfrButton type="submit" label="Envoyer le signalement" :disabled="envoiEnCours" />
      </li>
      <li>
        <DsfrButton type="button" secondary label="Annuler" @click="emit('annuler')" />
      </li>
    </ul>
  </form>
</template>
