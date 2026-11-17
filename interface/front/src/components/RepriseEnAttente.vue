<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '@/services/api'
import { LIBELLES_CONTROLE, type Verification } from '@/lib/story'

/**
 * Projet en cours de reprise (#37) : l'assistant l'analyse, puis le PO valide la PR de reprise
 * ici même. Ses propositions d'amélioration sont dans la demande d'analyse, dans la liste.
 */
type EtatReprise = Verification & { analyseEnCours: boolean }

const props = defineProps<{ projet: string; intervalleSuivi?: number }>()
const emit = defineEmits<{ fusionnee: [] }>()

const etat = ref<EtatReprise | null>(null)
const erreur = ref<string | null>(null)
const fusionEnCours = ref(false)
let minuteur: ReturnType<typeof setInterval> | null = null
const chemin = () => `/projets/${encodeURIComponent(props.projet)}/reprise`

async function charger(): Promise<void> {
  try {
    etat.value = await api.lire<EtatReprise>(chemin())
    erreur.value = null
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

async function fusionner(): Promise<void> {
  fusionEnCours.value = true
  try {
    etat.value = await api.envoyer<EtatReprise>(`${chemin()}/fusionner`, {})
    emit('fusionnee')
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    fusionEnCours.value = false
  }
}

function suivre(): void {
  if (minuteur) clearInterval(minuteur)
  void charger()
  minuteur = setInterval(() => void charger(), props.intervalleSuivi ?? 10000)
}
onMounted(suivre)
watch(() => props.projet, suivre)
onUnmounted(() => {
  if (minuteur) clearInterval(minuteur)
})
</script>

<template>
  <section class="fr-mb-3w" aria-labelledby="titre-reprise-attente">
    <h2 id="titre-reprise-attente" class="fr-h6 fr-mb-1w">Reprise du projet</h2>
    <div role="status">
      <p v-if="!etat && !erreur" class="fr-text--sm">Chargement de la reprise…</p>
      <DsfrAlert
        v-else-if="etat?.analyseEnCours && !etat.pullRequest"
        type="info"
        small
        description="L’assistant analyse le projet comme s’il avait été créé avec ADA (quelques minutes). Suivez-le dans la demande d’analyse ci-dessous : il y proposera ses améliorations, puis la reprise sera à valider ici."
      />
      <DsfrAlert
        v-else-if="etat && !etat.pullRequest"
        type="warning"
        small
        description="L’analyse s’est arrêtée sans pull request de reprise : l’assistant explique pourquoi dans la demande d’analyse ci-dessous."
      />
      <DsfrAlert
        v-else-if="etat?.pullRequest?.etat === 'fusionnee'"
        type="success"
        small
        description="Reprise validée : le projet suit maintenant les règles d’ADA. Choisissez les améliorations à publier dans la demande d’analyse."
      />
      <DsfrAlert
        v-else-if="etat?.pullRequest"
        type="info"
        small
        description="À vous de valider la reprise : ADA ajoute au projet les formulaires de story, la description de l’aperçu et les versions automatiques. Les demandes pourront être lancées ensuite."
      />
    </div>
    <DsfrAlert v-if="erreur" type="error" small :description="erreur" class="fr-mt-1w" />

    <template v-if="etat?.pullRequest && etat.pullRequest.etat === 'ouverte'">
      <ul class="fr-mt-1w fr-mb-1w fr-text--sm">
        <li v-for="controle in etat.controles" :key="controle.nom">{{ controle.nom }} : {{ LIBELLES_CONTROLE[controle.etat] }}</li>
      </ul>
      <p v-if="!etat.fusionnable && etat.raison" class="fr-text--sm">{{ etat.raison }}</p>
      <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--sm">
        <li>
          <DsfrButton label="Valider et fusionner la reprise" :disabled="!etat.fusionnable || fusionEnCours" @click="fusionner" />
        </li>
        <li>
          <a class="fr-btn fr-btn--secondary fr-btn--sm" :href="etat.pullRequest.url" target="_blank" rel="noopener">
            Voir la pull request <span class="fr-sr-only">(nouvelle fenêtre)</span>
          </a>
        </li>
      </ul>
    </template>
  </section>
</template>
