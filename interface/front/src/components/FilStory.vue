<script setup lang="ts">
import PropositionDecoupage from '@/components/PropositionDecoupage.vue'
import ReponseChoix from '@/components/ReponseChoix.vue'
import TexteRiche from '@/components/TexteRiche.vue'
import { computed, ref } from 'vue'
import {
  LIBELLES_CONTROLE,
  LIBELLES_STATUT,
  presenterMessage,
  lireChoix,
  lireDecoupage,
  lireStoriesParent,
  type StoryProposee,
  MARQUEUR_ASSISTANT,
  type Activite,
  type DetailStory,
  type Verification,
} from '@/lib/story'

const props = defineProps<{
  story: DetailStory
  /** Numéro et titre de la demande en cours sur le projet, s'il y en a une autre. */
  autreEnCours?: { numero: number; titre: string } | null
  activite?: Activite | null
  verification?: Verification | null
  erreurLancement?: string | null
  lancementEnCours?: boolean
  actionEnCours?: boolean
}>()
const emit = defineEmits<{
  lancer: []
  valider: []
  relancer: []
  fusionner: []
  relancerControles: []
  repondre: [texte: string]
  creerDecoupage: [stories: StoryProposee[]]
  ouvrir: [numero: number]
}>()

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
const replisOuverts = ref(-1)
const texte = ref('')
const erreur = ref('')
/** Dernier message de l'assistant (montré en entier sous l'action) ; le reste est l'historique, replié. */
const dernierMessage = computed(() => [...messages.value].reverse().find((message) => message.assistant) ?? null)
const historique = computed(() => messages.value.filter((message) => message.id !== dernierMessage.value?.id))
/** Une action est attendue du PO (sinon pas d'encart « À vous de jouer »). */
const actionAttendue = computed(
  () =>
    ['nouvelle', 'en-verification', 'plan-a-valider', 'questions', 'decoupage', 'besoin-dev'].includes(props.story.statut) ||
    (props.story.statut === 'en-cours' && Boolean(props.activite)),
)

/** Choix joints par l'assistant à ses dernières questions : réponse en cases à cocher (#35). */
const questionsAChoix = computed(() => {
  if (props.story.statut !== 'questions') return []
  const dernier = [...props.story.messages].reverse().find((message) => message.texte.startsWith(MARQUEUR_ASSISTANT))
  return dernier ? lireChoix(dernier.texte) : []
})

const champVisible = computed(
  () =>
    !travaille.value &&
    (props.story.statut === 'questions' ||
      ((props.story.statut === 'plan-a-valider' || props.story.statut === 'decoupage') && modeModification.value)),
)

/** Découpage proposé par l'assistant (#36) : stories à cocher. */
const propositionDecoupage = computed(() => {
  if (props.story.statut !== 'decoupage') return []
  const dernier = [...props.story.messages].reverse().find((message) => message.texte.startsWith(MARQUEUR_ASSISTANT))
  return dernier ? lireDecoupage(dernier.texte) : []
})
/** Demande découpée : ses stories, cochées une fois livrées. */
const storiesParent = computed(() => lireStoriesParent(props.story.texteBrut ?? ''))

/** « de la story n° 12 », « du signalement n° 4 »… : où la réponse est enregistrée sur GitHub. */
const designation = computed(() => {
  const nature = props.story.type === 'bug' ? 'du signalement' : props.story.type === 'libre' ? 'de la demande' : 'de la story'
  return `${nature} n° ${props.story.numero}`
})

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

    <!-- 1. Ce qu'on attend du PO, toujours en haut : rien à chercher, rien à faire défiler. -->
    <section v-if="travaille" class="fr-callout fr-mb-3w activite" aria-labelledby="titre-action">
      <h3 id="titre-action" class="fr-callout__title fr-h6">L’assistant travaille</h3>
      <div role="status" aria-live="polite">
        <p class="fr-mb-1w">
          <span class="fr-icon-refresh-line fr-icon--sm activite__icone" aria-hidden="true" />
          <strong>
            L’assistant {{ activite?.phase === 'realisation' ? 'réalise la demande' : 'analyse la demande' }}…
          </strong>
          <span v-if="activite?.phase === 'realisation'" class="fr-text--sm">
            L’aperçu montre son travail en cours : ce n’est pas encore terminé. Vous serez prévenu
            ici quand ce sera prêt à vérifier.
          </span>
        </p>
        <ol v-if="dernieresActions.length" class="activite__journal fr-text--sm">
          <li v-for="action in dernieresActions" :key="action.le + action.texte">
            <span class="fr-text--xs">{{ heure(action.le) }}</span> {{ action.texte }}
          </li>
        </ol>
      </div>
    </section>

    <section v-else-if="actionAttendue" class="fr-callout fr-mb-3w a-vous" aria-labelledby="titre-action">
      <h3 id="titre-action" class="fr-callout__title fr-h6">
        {{ story.statut === 'en-verification' ? 'À vous de vérifier' : 'À vous de jouer' }}
      </h3>

      <template v-if="story.statut === 'nouvelle'">
        <DsfrAlert v-if="blocage" type="warning" small :description="blocage" />
        <template v-else>
          <DsfrButton
            icon="fr-icon-play-line"
            :label="lancementEnCours ? 'Lancement…' : story.type === 'bug' ? 'Lancer la correction' : 'Lancer cette story'"
            aria-describedby="lancement-enregistrement"
            :disabled="lancementEnCours"
            @click="emit('lancer')"
          />
          <p id="lancement-enregistrement" class="fr-text--sm fr-mt-1w fr-mb-0">
            <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
            Le lancement est noté sur GitHub, à votre nom : un commentaire et le statut {{ designation }}.
          </p>
        </template>
        <DsfrAlert v-if="erreurLancement" type="error" small :description="erreurLancement" class="fr-mt-2w" />
      </template>

      <template v-else-if="story.statut === 'en-verification'">
        <p class="fr-text--sm">
          Regardez le résultat dans l’aperçu. Quand tous les contrôles sont réussis, validez :
          la demande sera ajoutée au projet et la suivante pourra être lancée.
        </p>
        <p v-if="!verification" class="fr-text--sm">Lecture des contrôles…</p>
        <template v-else>
          <ul class="fr-text--sm controles">
            <li v-for="controle in verification.controles" :key="controle.nom">
              <span
                :class="{
                  'fr-icon-checkbox-circle-fill controle--ok': controle.etat === 'reussi',
                  'fr-icon-close-circle-fill controle--ko': controle.etat === 'echec',
                  'fr-icon-time-line': controle.etat === 'en-cours' || controle.etat === 'en-attente',
                  'fr-icon-warning-line': controle.etat === 'non-lance',
                }"
                class="fr-icon--sm"
                aria-hidden="true"
              />
              {{ controle.nom }} : {{ LIBELLES_CONTROLE[controle.etat] }}
            </li>
          </ul>
          <p v-if="verification.raison" class="fr-text--sm fr-mb-2w">{{ verification.raison }}</p>
          <ul class="fr-btns-group fr-btns-group--inline-md">
            <li>
              <DsfrButton
                icon="fr-icon-check-line"
                label="Valider et fusionner"
                :disabled="!verification.fusionnable || actionEnCours"
                @click="emit('fusionner')"
              />
            </li>
            <li v-if="verification.controles.some((controle) => controle.etat === 'non-lance')">
              <DsfrButton secondary icon="fr-icon-refresh-line" label="Relancer les contrôles" :disabled="actionEnCours" @click="emit('relancerControles')" />
            </li>
          </ul>
        </template>
      </template>

      <template v-else-if="story.statut === 'en-cours' || story.statut === 'besoin-dev'">
        <p class="fr-text--sm fr-mb-1w">
          {{ story.statut === 'besoin-dev' ? 'L’assistant est bloqué sur cette demande.' : 'L’assistant ne travaille pas sur cette demande en ce moment.' }}
        </p>
        <DsfrAlert v-if="activite?.erreur" type="error" small :description="activite.erreur" class="fr-mb-2w" />
        <DsfrButton size="sm" secondary icon="fr-icon-refresh-line" label="Relancer l’assistant" :disabled="actionEnCours" @click="emit('relancer')" />
      </template>

      <div v-else-if="story.statut === 'plan-a-valider' && !modeModification">
        <p class="fr-text--sm fr-mb-2w">L’assistant attend votre accord sur le plan ci-dessous avant de commencer.</p>
        <p id="validation-enregistrement" class="fr-text--sm fr-mb-2w">
          <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
          Votre accord est enregistré sur GitHub, en commentaire {{ designation }}, à votre nom.
        </p>
        <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
          <li>
            <DsfrButton icon="fr-icon-check-line" label="Valider le plan" aria-describedby="validation-enregistrement" :disabled="actionEnCours" @click="emit('valider')" />
          </li>
          <li>
            <DsfrButton secondary label="Demander une modification" :disabled="actionEnCours" @click="modeModification = true" />
          </li>
        </ul>
      </div>

      <PropositionDecoupage
        v-if="propositionDecoupage.length && !modeModification"
        :key="`decoupage-${story.messages.length}`"
        :stories="propositionDecoupage"
        :designation="`la demande n° ${story.numero}`"
        :action-en-cours="actionEnCours"
        @creer="(stories) => emit('creerDecoupage', stories)"
        @autre-decoupage="modeModification = true"
      />
      <ReponseChoix
        v-if="champVisible && questionsAChoix.length"
        :key="story.messages.length"
        :questions="questionsAChoix"
        :action-en-cours="actionEnCours"
        description-envoi="reponse-choix-enregistrement"
        @repondre="(reponse) => emit('repondre', reponse)"
      >
        <template #avant-envoi>
          <p id="reponse-choix-enregistrement" class="fr-text--sm fr-mb-2w">
            <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
            <strong>En envoyant, vos réponses sont enregistrées sur GitHub, en commentaire
            {{ designation }}</strong>, à votre nom et visible par l’équipe du projet.
          </p>
        </template>
      </ReponseChoix>
      <form v-else-if="champVisible" novalidate class="fr-mt-2w" @submit.prevent="envoyer">
        <p v-if="story.statut === 'questions'" class="fr-text--sm fr-mb-2w">
          L’assistant attend vos réponses à ses questions ci-dessous pour continuer.
        </p>
        <DsfrInputGroup
          v-model="texte"
          :label="story.statut === 'questions' ? 'Vos réponses' : story.statut === 'decoupage' ? 'Ce qu’il faut changer dans le découpage' : 'Ce qu’il faut changer dans le plan'"
          label-visible
          is-textarea
          :error-message="erreur"
        />
        <p id="reponse-enregistrement" class="fr-text--sm fr-mb-2w">
          <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
          <strong>En envoyant, votre texte est enregistré tel quel sur GitHub, en commentaire
          {{ designation }}</strong>, à votre nom et visible par l’équipe du projet. Il garde la trace
          des échanges avec l’assistant.
        </p>
        <ul class="fr-btns-group fr-btns-group--inline-md">
          <li><DsfrButton type="submit" label="Envoyer" aria-describedby="reponse-enregistrement" :disabled="actionEnCours" /></li>
          <li v-if="modeModification">
            <DsfrButton type="button" tertiary label="Annuler" @click="modeModification = false" />
          </li>
        </ul>
      </form>
    </section>

    <!-- 2. Le dernier message de l'assistant, en entier : c'est lui qui explique l'action. -->
    <section v-if="dernierMessage" class="fr-mb-3w" aria-labelledby="titre-dernier-message">
      <h3 id="titre-dernier-message" class="fr-h6 fr-mb-1w">Dernier message de l’assistant</h3>
      <div class="fil__assistant dernier-message">
        <p class="fr-text--xs fr-mb-1v"><strong>{{ dernierMessage.auteur }}</strong> — {{ date(dernierMessage.le) }}</p>
        <TexteRiche :texte="dernierMessage.texte" />
      </div>
    </section>

    <!-- 3. La demande elle-même. -->
    <section v-if="story.contenu" aria-labelledby="titre-story">
      <h3 id="titre-story" class="fr-h6 fr-mb-1w">La story</h3>
      <p class="fr-mb-1w">
        <strong>En tant que</strong> {{ story.contenu.role }},<br />
        <strong>je veux</strong> {{ story.contenu.besoin }},<br />
        <strong>afin de</strong> {{ story.contenu.benefice }}.
      </p>
      <p class="fr-text--bold fr-mb-1v">Critères d’acceptation</p>
      <ul>
        <li v-for="critere in story.contenu.criteres" :key="critere">{{ critere }}</li>
      </ul>
    </section>
    <section v-else-if="story.contenuBug" aria-labelledby="titre-probleme">
      <h3 id="titre-probleme" class="fr-h6 fr-mb-1w">Le problème signalé</h3>
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
    <section v-else-if="story.contenuLibre" aria-labelledby="titre-libre">
      <h3 id="titre-libre" class="fr-h6 fr-mb-1w">Demande libre (hors story)</h3>
      <p class="fr-text--xs fr-mb-1w">
        Enregistrée sur GitHub comme demande n° {{ story.numero }} « mode libre ».
      </p>
      <p class="fil-pre">{{ story.contenuLibre }}</p>
    </section>
    <p v-else class="fr-text--sm">{{ story.texteBrut }}</p>

    <section v-if="storiesParent.length" class="fr-mb-3w" aria-labelledby="titre-parent">
      <h3 id="titre-parent" class="fr-h6 fr-mb-1w">Découpée en {{ storiesParent.length }} stories</h3>
      <ul class="fr-p-0 stories-parent">
        <li v-for="enfant in storiesParent" :key="enfant.numero" class="fr-mb-1w">
          <DsfrButton
            size="sm"
            tertiary
            :label="`#${enfant.numero} ${enfant.titre} — ${enfant.livree ? 'livrée' : 'à faire'}`"
            :icon="enfant.livree ? 'fr-icon-checkbox-circle-line' : 'fr-icon-time-line'"
            @click="emit('ouvrir', enfant.numero)"
          />
        </li>
      </ul>
    </section>

    <!-- 4. Le passé, replié : journal, demande de fusion, échanges dans l'ordre. -->
    <section v-if="story.statut !== 'nouvelle'" aria-labelledby="titre-suivi">
      <h3 id="titre-suivi" class="fr-h6">Suivi</h3>
      <ol v-if="!travaille && dernieresActions.length" class="activite__journal fr-text--sm">
        <li v-for="action in dernieresActions" :key="action.le + action.texte">
          <span class="fr-text--xs">{{ heure(action.le) }}</span> {{ action.texte }}
        </li>
      </ol>
      <p v-if="activite?.pullRequest" class="fr-mt-1w">
        <a class="fr-link" :href="activite.pullRequest" target="_blank" rel="noopener">
          Voir la demande de fusion (pull request) et ses contrôles<span class="fr-sr-only"> (nouvelle fenêtre)</span>
        </a>
      </p>
      <DsfrAccordionsGroup v-model="replisOuverts" class="fr-mb-2w">
        <DsfrAccordion v-if="historique.length" id="historique" :title="`Voir l’historique (${historique.length} échange${historique.length > 1 ? 's' : ''})`">
          <ol class="fil">
            <li v-for="message in historique" :key="message.id" :class="{ 'fil__assistant': message.assistant }">
              <p class="fr-text--xs fr-mb-1v">
                <strong>{{ message.auteur }}</strong> — {{ date(message.le) }}
              </p>
              <TexteRiche :texte="message.texte" />
            </li>
          </ol>
        </DsfrAccordion>
        <DsfrAccordion id="pourquoi-github" title="Pourquoi les échanges sont-ils enregistrés sur GitHub ?">
          <p class="fr-text--sm fr-mb-1w">
            Vos réponses, votre accord sur le plan et les questions de l’assistant sont des
            commentaires {{ designation }}. C’est un choix volontaire :
          </p>
          <ul class="fr-text--sm">
            <li><strong>Traçabilité</strong> : on sait qui a demandé quoi et qui a validé quel plan, quand. Important quand du code est écrit par une IA.</li>
            <li><strong>L’assistant s’en sert</strong> : à chaque reprise, il relit tout l’échange ; rien ne se perd.</li>
            <li><strong>Un développeur peut reprendre</strong> en cas de blocage : tout le contexte est au même endroit.</li>
            <li><strong>L’historique appartient au projet</strong>, pas à ADA : il reste si l’outil change.</li>
          </ul>
          <p class="fr-text--sm fr-mb-0">
            N’y écrivez donc rien de confidentiel. Vous pouvez modifier ou supprimer vos commentaires
            sur GitHub ; l’assistant en tiendra compte à sa prochaine lecture.
          </p>
        </DsfrAccordion>
      </DsfrAccordionsGroup>
    </section>
  </article>
</template>

<style scoped>
.stories-parent {
  list-style: none;
}
</style>
