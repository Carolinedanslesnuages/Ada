<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { bonnesReponses, estJuste } from '@/lib/quiz'
import { useQuizStore } from '@/stores/quiz'

const magasin = useQuizStore()
const { etape, rang, question, corrigee, juste, derniere, score, reponses } = storeToRefs(magasin)
/** Le quiz ne change pas pendant le parcours : pas besoin de le rendre réactif. */
const quiz = magasin.quiz

const erreur = ref('')
const titreEtape = useTemplateRef<HTMLElement>('titre-etape')
const correction = useTemplateRef<HTMLElement>('correction')
const etapeQuestion = useTemplateRef<HTMLElement>('etape-question')

const etapes = computed(() => quiz.questions.map((_, numero) => `Question ${numero + 1}`))
const options = computed(() =>
  question.value.choix.map((possibilite) => ({
    id: `choix-${question.value.id}-${possibilite.id}`,
    name: `question-${question.value.id}`,
    label: possibilite.texte,
    value: possibilite.id,
    disabled: corrigee.value,
  })),
)
const choixUnique = computed({
  get: () => reponses.value[question.value.id]?.[0],
  set: (valeur: string | number | boolean | undefined) => magasin.repondre(valeur === undefined ? [] : [String(valeur)]),
})
const choixMultiples = computed({
  get: () => reponses.value[question.value.id] ?? [],
  set: (valeurs: unknown[]) => magasin.repondre(valeurs.map(String)),
})

/** À chaque nouvelle étape ou question, le focus va à son titre (lecteurs d'écran, clavier). */
watch([etape, rang], async () => {
  erreur.value = ''
  await nextTick()
  const titre = etape.value === 'question' ? etapeQuestion.value?.querySelector<HTMLElement>('h2') : titreEtape.value
  titre?.setAttribute('tabindex', '-1')
  titre?.focus()
})

async function valider(): Promise<void> {
  if ((reponses.value[question.value.id] ?? []).length === 0) {
    erreur.value = question.value.type === 'multiple' ? 'Cochez au moins une réponse' : 'Choisissez une réponse'
    return
  }
  erreur.value = ''
  magasin.corriger()
  await nextTick()
  correction.value?.focus()
}
</script>

<template>
  <h1>{{ quiz.titre }}</h1>

  <section v-if="etape === 'accueil'" aria-labelledby="titre-accueil">
    <h2 id="titre-accueil" ref="titre-etape" tabindex="-1" class="fr-h4">Avant de commencer</h2>
    <p>{{ quiz.introduction }}</p>
    <p>
      {{ quiz.questions.length }} questions. Il faut {{ quiz.seuilReussite }} % de bonnes réponses pour
      réussir. Rien n’est enregistré.
    </p>
    <DsfrButton label="Commencer" icon="fr-icon-arrow-right-line" icon-right @click="magasin.commencer()" />
  </section>

  <section v-else-if="etape === 'question'" ref="etape-question">
    <!-- Le composant d'étapes du DSFR porte le titre (h2) : « Question 2, Étape 2 sur 3 ». -->
    <DsfrStepper :steps="etapes" :current-step="rang + 1" />
    <form novalidate @submit.prevent="corrigee ? magasin.suivante() : valider()">
      <DsfrRadioButtonSet
        v-if="question.type === 'unique'"
        v-model="choixUnique"
        :name="`question-${question.id}`"
        :legend="question.enonce"
        :options="options"
        :error-message="erreur"
        required
      />
      <DsfrCheckboxSet
        v-else
        v-model="choixMultiples"
        :legend="`${question.enonce} (plusieurs réponses possibles)`"
        :options="options"
        :error-message="erreur"
      />

      <div v-if="corrigee" ref="correction" tabindex="-1" class="fr-mb-3w">
        <DsfrAlert
          :type="juste ? 'success' : 'error'"
          :title="juste ? 'Bonne réponse' : 'Ce n’est pas la bonne réponse'"
          :description="`${juste ? '' : `La bonne réponse : ${bonnesReponses(question).join(', ')}. `}${question.explication}`"
        />
      </div>

      <DsfrButton
        type="submit"
        :label="!corrigee ? 'Valider ma réponse' : derniere ? 'Voir mon résultat' : 'Question suivante'"
      />
    </form>
  </section>

  <section v-else aria-labelledby="titre-resultat">
    <h2 id="titre-resultat" ref="titre-etape" tabindex="-1" class="fr-h4">Votre résultat</h2>
    <DsfrAlert
      :type="score.reussi ? 'success' : 'warning'"
      :title="`${score.justes} bonne${score.justes > 1 ? 's' : ''} réponse${score.justes > 1 ? 's' : ''} sur ${score.total} (${score.pourcentage} %)`"
      :description="score.reussi ? 'Réussi : bravo !' : `Pas encore : il faut ${quiz.seuilReussite} % de bonnes réponses. Vous pouvez recommencer.`"
    />
    <h3 class="fr-h6 fr-mt-3w">Récapitulatif</h3>
    <ol>
      <li v-for="questionPosee in quiz.questions" :key="questionPosee.id" class="fr-mb-2w">
        <p class="fr-mb-1v">
          {{ questionPosee.enonce }}
          <strong>{{ estJuste(questionPosee, reponses[questionPosee.id] ?? []) ? '— Juste' : '— À revoir' }}</strong>
        </p>
        <p class="fr-text--sm fr-mb-0">
          Bonne réponse : {{ bonnesReponses(questionPosee).join(', ') }}. {{ questionPosee.explication }}
        </p>
      </li>
    </ol>
    <DsfrButton label="Recommencer" secondary icon="fr-icon-refresh-line" @click="magasin.commencer()" />
  </section>
</template>
