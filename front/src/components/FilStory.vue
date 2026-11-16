<script setup lang="ts">
import { computed, ref } from 'vue'
import { LIBELLES_STATUT, presenterMessage, type Activite, type DetailStory } from '@/lib/story'

const props = defineProps<{
  story: DetailStory
  /** Numéro et titre de la demande en cours sur le projet, s'il y en a une autre. */
  autreEnCours?: { numero: number; titre: string } | null
  activite?: Activite | null
  erreurLancement?: string | null
  lancementEnCours?: boolean
  actionEnCours?: boolean
}>()
const emit = defineEmits<{ lancer: []; valider: []; relancer: []; repondre: [texte: string] }>()

/** Pourquoi la demande ne peut pas être lancée, ou null si elle peut l'être. */
const blocage = computed(() => {
  if (props.story.statut !== 'nouvelle') return null
  if (!props.story.prete) return `À corriger sur GitHub avant de la lancer : ${props.story.raison}.`
  if (props.autreEnCours)
    return `La demande #${props.autreEnCours.numero} « ${props.autreEnCours.titre} » est en cours : une seule à la fois.`
  return null
})

const messages = computed(() => props.story.messages.map((m) => ({ id: m.id, le: m.le, ...presenterMessage(m) })))
const travaille = computed(() => props.activite?.enCours === true)
const dernieresActions = computed(() => (props.activite?.journal ?? []).slice(-8).reverse())

/** Champ de texte : réponse aux questions, ou modification demandée sur le plan. */
const modeModification = ref(false)
const texte = ref('')
const erreur = ref('')
const champVisible = computed(
  () => !travaille.value && (props.story.statut === 'questions' || (props.story.statut === 'plan-a-valider' && modeModification.value)),
)

const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function envoyer(): void {
  if (!texte.value.trim()) {
    erreur.value = props.story.statut === 'questions' ? 'Écrivez vos réponses avant d’envoyer' : 'Dites ce qu’il faut changer dans le plan'
    return
  }
  erreur.value = ''
  emit('repondre', texte.value.trim())
  texte.value = ''
  modeModification.value = false
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

    <section v-if="story.statut !== 'nouvelle'" aria-labelledby="titre-suivi">
      <h3 id="titre-suivi" class="fr-h6">Suivi</h3>

      <div class="activite fr-mb-3w" role="status" aria-live="polite">
        <p v-if="travaille" class="fr-mb-1w">
          <span class="fr-icon-refresh-line fr-icon--sm activite__icone" aria-hidden="true" />
          <strong>
            L’assistant {{ activite?.phase === 'realisation' ? 'réalise la demande' : 'analyse la demande' }}…
          </strong>
          <span v-if="activite?.phase === 'realisation'" class="fr-text--sm"> L’aperçu se met à jour au fil de son travail.</span>
        </p>
        <div v-else-if="(story.statut === 'en-cours' || story.statut === 'besoin-dev') && activite" class="fr-mb-1w">
          <p class="fr-text--sm fr-mb-1w">
            {{ story.statut === 'besoin-dev' ? 'L’assistant est bloqué sur cette demande.' : 'L’assistant ne travaille pas sur cette demande en ce moment.' }}
          </p>
          <DsfrButton size="sm" secondary icon="fr-icon-refresh-line" label="Relancer l’assistant" :disabled="actionEnCours" @click="emit('relancer')" />
        </div>
        <ol v-if="dernieresActions.length" class="activite__journal fr-text--sm">
          <li v-for="action in dernieresActions" :key="action.le + action.texte">
            <span class="fr-text--xs">{{ heure(action.le) }}</span> {{ action.texte }}
          </li>
        </ol>
        <DsfrAlert v-if="activite?.erreur && !travaille" type="error" small :description="activite.erreur" />
        <p v-if="activite?.pullRequest" class="fr-mt-1w">
          <a class="fr-link" :href="activite.pullRequest" target="_blank" rel="noopener">
            Voir la demande de fusion (pull request) et ses contrôles<span class="fr-sr-only"> (nouvelle fenêtre)</span>
          </a>
        </p>
      </div>

      <ol v-if="messages.length" class="fil">
        <li v-for="message in messages" :key="message.id" :class="{ 'fil__assistant': message.assistant }">
          <p class="fr-text--xs fr-mb-1v">
            <strong>{{ message.auteur }}</strong> — {{ date(message.le) }}
          </p>
          {{ message.texte }}
        </li>
      </ol>

      <div v-if="story.statut === 'plan-a-valider' && !travaille && !modeModification" class="fr-mt-2w">
        <DsfrAlert type="info" small class="fr-mb-2w" description="L’assistant attend votre accord sur le plan ci-dessus avant de commencer." />
        <ul class="fr-btns-group fr-btns-group--inline-md">
          <li>
            <DsfrButton icon="fr-icon-check-line" label="Valider le plan" :disabled="actionEnCours" @click="emit('valider')" />
          </li>
          <li>
            <DsfrButton secondary label="Demander une modification" :disabled="actionEnCours" @click="modeModification = true" />
          </li>
        </ul>
      </div>

      <form v-if="champVisible" novalidate class="fr-mt-2w" @submit.prevent="envoyer">
        <DsfrAlert
          v-if="story.statut === 'questions'"
          type="info"
          small
          class="fr-mb-2w"
          description="L’assistant attend vos réponses à ses questions ci-dessus pour continuer."
        />
        <DsfrInputGroup
          v-model="texte"
          :label="story.statut === 'questions' ? 'Vos réponses' : 'Ce qu’il faut changer dans le plan'"
          label-visible
          is-textarea
          :error-message="erreur"
        />
        <ul class="fr-btns-group fr-btns-group--inline-md">
          <li><DsfrButton type="submit" label="Envoyer" :disabled="actionEnCours" /></li>
          <li v-if="modeModification">
            <DsfrButton type="button" tertiary label="Annuler" @click="modeModification = false" />
          </li>
        </ul>
      </form>
    </section>
  </article>
</template>
