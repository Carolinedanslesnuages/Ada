<script setup lang="ts">
import { computed, ref } from 'vue'
import { LIBELLES_STATUT, type DetailStory } from '@/lib/story'

const props = defineProps<{
  story: DetailStory
  /** Numéro et titre de la demande en cours sur le projet, s'il y en a une autre. */
  autreEnCours?: { numero: number; titre: string } | null
  erreurLancement?: string | null
  lancementEnCours?: boolean
}>()
const emit = defineEmits<{ repondre: [texte: string]; lancer: [] }>()

/** Pourquoi la demande ne peut pas être lancée, ou null si elle peut l'être. */
const blocage = computed(() => {
  if (props.story.statut !== 'nouvelle') return null
  if (!props.story.prete) return `À corriger sur GitHub avant de la lancer : ${props.story.raison}.`
  if (props.autreEnCours)
    return `La demande #${props.autreEnCours.numero} « ${props.autreEnCours.titre} » est en cours : une seule à la fois.`
  return null
})

const reponse = ref('')
const erreur = ref('')

const date = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function envoyer(): void {
  if (!reponse.value.trim()) {
    erreur.value = 'Écrivez votre message avant de l’envoyer'
    return
  }
  erreur.value = ''
  emit('repondre', reponse.value.trim())
  reponse.value = ''
}
</script>

<template>
  <article>
    <h2 class="fr-h4 fr-mb-1w">#{{ story.numero }} — {{ story.titre }}</h2>
    <p class="fr-mb-2w">
      <DsfrBadge
        :label="LIBELLES_STATUT[story.statut].libelle"
        :type="LIBELLES_STATUT[story.statut].type"
        small
      />
      <a class="fr-link fr-link--sm fr-ml-2w" :href="story.url" target="_blank" rel="noopener">
        Voir sur GitHub<span class="fr-sr-only"> (nouvelle fenêtre)</span>
      </a>
    </p>

    <div v-if="story.statut === 'nouvelle'" class="fr-mb-3w">
      <DsfrAlert v-if="blocage" type="warning" small :description="blocage" />
      <DsfrButton
        v-else
        icon="fr-icon-play-line"
        :label="lancementEnCours ? 'Lancement…' : story.type === 'bug' ? 'Lancer la correction' : 'Lancer cette story'"
        :disabled="lancementEnCours"
        @click="emit('lancer')"
      />
      <DsfrAlert v-if="erreurLancement" type="error" small :description="erreurLancement" class="fr-mt-2w" />
    </div>

    <section v-if="story.contenu" aria-labelledby="titre-story">
      <h3 id="titre-story" class="fr-sr-only">La story</h3>
      <p class="fr-mb-1w">
        <strong>En tant que</strong> {{ story.contenu.role }},<br />
        <strong>je veux</strong> {{ story.contenu.besoin }},<br />
        <strong>afin de</strong> {{ story.contenu.benefice }}.
      </p>
      <h3 class="fr-h6 fr-mb-1w">Critères d’acceptation</h3>
      <ul>
        <li v-for="critere in story.contenu.criteres" :key="critere">{{ critere }}</li>
      </ul>
    </section>
    <section v-else-if="story.contenuBug" aria-labelledby="titre-probleme">
      <h3 id="titre-probleme" class="fr-sr-only">Le problème signalé</h3>
      <dl class="fr-mb-2w">
        <dt><strong>Ce qui se passe</strong></dt>
        <dd>{{ story.contenuBug.constate }}</dd>
        <dt><strong>Ce qui devrait se passer</strong></dt>
        <dd>{{ story.contenuBug.attendu }}</dd>
        <dt><strong>Comment le reproduire</strong></dt>
        <dd class="fil-pre">{{ story.contenuBug.etapes }}</dd>
        <template v-if="story.contenuBug.ecran">
          <dt><strong>Écran concerné</strong></dt>
          <dd>{{ story.contenuBug.ecran }}</dd>
        </template>
      </dl>
    </section>
    <p v-else class="fr-text--sm">{{ story.texteBrut }}</p>

    <section aria-labelledby="titre-conversation">
      <h3 id="titre-conversation" class="fr-h6">Conversation</h3>
      <p v-if="story.messages.length === 0" class="fr-text--sm">
        Pas encore de message. L’assistant posera ici ses questions et son plan.
      </p>
      <ol v-else class="fil" aria-live="polite">
        <li v-for="message in story.messages" :key="message.id">
          <p class="fr-text--xs fr-mb-1v">
            <strong>{{ message.auteur }}</strong> — {{ date(message.le) }}
          </p>
          {{ message.texte }}
        </li>
      </ol>

      <form novalidate @submit.prevent="envoyer">
        <DsfrInputGroup
          v-model="reponse"
          label="Votre réponse"
          label-visible
          is-textarea
          :error-message="erreur"
        />
        <DsfrButton type="submit" label="Envoyer" />
      </form>
    </section>
  </article>
</template>
