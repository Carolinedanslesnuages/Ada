<script setup lang="ts">
import TexteRiche from '@/components/TexteRiche.vue'
import { computed, ref } from 'vue'
import { MARQUEUR_LANCEMENT, MESSAGE_MAX, presenterMessage, type DetailStory } from '@/lib/story'

/**
 * Conversation (« vrai prompt ») : tous les échanges dans l'ordre, puis, quand ADA a répondu, le
 * message suivant du PO, « c'est bon » (proposer les changements au projet) ou « arrêter ».
 */
const props = defineProps<{ story: DetailStory; attendReponse: boolean; actionEnCours?: boolean }>()
const emit = defineEmits<{ envoyer: [texte: string]; terminer: []; arreter: [] }>()

const echanges = computed(() => [
  ...(props.story.contenuLibre ? [{ id: 0, auteur: 'Vous', texte: props.story.contenuLibre, assistant: false, le: props.story.creeeLe }] : []),
  ...props.story.messages
    .filter((message) => !message.texte.startsWith(MARQUEUR_LANCEMENT))
    .map((message) => ({ id: message.id, le: message.le, ...presenterMessage(message) })),
])

const texte = ref('')
const erreur = ref('')
const confirmerArret = ref(false)
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function envoyer(): void {
  const propre = texte.value.trim()
  if (!propre) {
    erreur.value = 'Écrivez votre message à ADA'
    return
  }
  if (propre.length > MESSAGE_MAX) {
    erreur.value = `${MESSAGE_MAX} caractères au maximum par message : envoyez la suite dans un autre message`
    return
  }
  erreur.value = ''
  emit('envoyer', propre)
  texte.value = ''
}
</script>

<template>
  <section class="fr-mb-3w" aria-labelledby="titre-conversation">
    <h3 id="titre-conversation" class="fr-h6 fr-mb-1w">Conversation avec ADA</h3>
    <ol class="fil conversation">
      <li v-for="message in echanges" :key="message.id" :class="{ fil__assistant: message.assistant, conversation__po: !message.assistant }">
        <p class="fr-text--xs fr-mb-1v">
          <strong>{{ message.assistant ? 'ADA' : message.auteur }}</strong> — {{ date(message.le) }}
        </p>
        <TexteRiche :texte="message.texte" />
      </li>
    </ol>

    <div v-if="attendReponse" class="fr-callout fr-mt-2w a-vous">
      <form novalidate @submit.prevent="envoyer">
        <DsfrInputGroup v-model="texte" label="Votre message à ADA" label-visible is-textarea :error-message="erreur" />
        <p id="message-enregistrement" class="fr-text--sm fr-mb-2w">
          <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
          Votre message est enregistré sur GitHub, dans la conversation n° {{ story.numero }}, à votre nom.
        </p>
        <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
          <li>
            <DsfrButton type="submit" icon="fr-icon-send-plane-line" label="Envoyer" aria-describedby="message-enregistrement" :disabled="actionEnCours" />
          </li>
        </ul>
      </form>

      <h4 class="fr-h6 fr-mt-2w fr-mb-1w">Vous avez terminé ?</h4>
      <p id="terminer-explication" class="fr-text--sm fr-mb-2w">
        « C’est bon » : ADA propose ses changements au projet. Ils passent les contrôles, puis vous
        les vérifiez et les ajoutez, comme une story. Sans aucun changement, la conversation se ferme.
      </p>
      <ul v-if="!confirmerArret" class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
        <li>
          <DsfrButton
            secondary
            icon="fr-icon-check-line"
            label="C’est bon : proposer ces changements"
            aria-describedby="terminer-explication"
            :disabled="actionEnCours"
            @click="emit('terminer')"
          />
        </li>
        <li><DsfrButton tertiary label="Arrêter la conversation" :disabled="actionEnCours" @click="confirmerArret = true" /></li>
      </ul>
      <div v-else role="group" aria-labelledby="arret-question">
        <p id="arret-question" class="fr-text--sm fr-mb-2w">
          <strong>Arrêter la conversation ?</strong> Rien de ce qu’ADA a fait ne sera ajouté au projet.
        </p>
        <ul class="fr-btns-group fr-btns-group--inline-md">
          <li><DsfrButton label="Oui, arrêter" :disabled="actionEnCours" @click="emit('arreter')" /></li>
          <li><DsfrButton secondary label="Non, continuer" @click="confirmerArret = false" /></li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.conversation__po {
  margin-left: 2rem;
}
</style>
