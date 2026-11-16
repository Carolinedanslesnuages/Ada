<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import ChampQuestion from '@/components/ChampQuestion.vue'
import { envoyerReponse, type Valeurs } from '@/services/formulaire'
import { useFormulaireStore } from '@/stores/formulaire'

const magasin = useFormulaireStore()
const { formulaire, erreur: erreurChargement } = storeToRefs(magasin)

const valeurs = ref<Valeurs>({})
const erreurs = ref<Record<string, string>>({})
const envoiEnCours = ref(false)
const confirmation = ref<string | null>(null)
const erreurEnvoi = ref<string | null>(null)
const resumeErreurs = useTemplateRef<HTMLElement>('resume-erreurs')

onMounted(() => magasin.charger())

async function envoyer(): Promise<void> {
  if (!formulaire.value || envoiEnCours.value) return
  envoiEnCours.value = true
  confirmation.value = null
  erreurEnvoi.value = null
  try {
    const resultat = await envoyerReponse(valeurs.value)
    if (resultat.ok) {
      erreurs.value = {}
      valeurs.value = {}
      confirmation.value = formulaire.value.messageConfirmation
    } else {
      erreurs.value = resultat.erreurs
      // Le résumé des erreurs reçoit le focus : il est lu, et chaque lien mène au champ concerné.
      await nextTick()
      resumeErreurs.value?.focus()
    }
  } catch {
    erreurEnvoi.value = 'Votre réponse n’a pas pu être envoyée. Réessayez dans quelques instants.'
  } finally {
    envoiEnCours.value = false
  }
}

const libelleDe = (identifiant: string) =>
  formulaire.value?.questions.find((question) => question.id === identifiant)?.libelle ?? identifiant
</script>

<template>
  <DsfrAlert v-if="erreurChargement" type="error" title="Formulaire indisponible" :description="erreurChargement" />
  <template v-else-if="formulaire">
    <h1>{{ formulaire.titre }}</h1>
    <p>{{ formulaire.introduction }}</p>
    <DsfrNotice title="Prototype : n’indiquez aucune donnée personnelle réelle." />

    <div role="status" class="fr-my-3w">
      <DsfrAlert v-if="confirmation" type="success" title="Réponse envoyée" :description="confirmation" />
    </div>
    <DsfrAlert v-if="erreurEnvoi" type="error" title="Envoi impossible" :description="erreurEnvoi" class="fr-mb-3w" />

    <div
      v-if="Object.keys(erreurs).length > 0"
      ref="resume-erreurs"
      tabindex="-1"
      class="fr-alert fr-alert--error fr-mb-3w"
    >
      <h2 class="fr-alert__title">Le formulaire contient {{ Object.keys(erreurs).length }} erreur(s)</h2>
      <ul>
        <li v-for="(message, identifiant) in erreurs" :key="identifiant">
          <a :href="`#question-${identifiant}`">{{ libelleDe(String(identifiant)) }} : {{ message }}</a>
        </li>
      </ul>
    </div>

    <form novalidate @submit.prevent="envoyer">
      <p class="fr-hint-text">Les champs marqués « (obligatoire) » doivent être remplis.</p>
      <div v-for="question in formulaire.questions" :key="question.id" class="fr-mb-3w">
        <ChampQuestion v-model="valeurs[question.id]" :question="question" :erreur="erreurs[question.id]" />
      </div>
      <DsfrButton type="submit" :label="envoiEnCours ? 'Envoi en cours…' : 'Envoyer ma réponse'" :disabled="envoiEnCours" />
    </form>
  </template>
  <p v-else role="status">Chargement du formulaire…</p>
</template>
