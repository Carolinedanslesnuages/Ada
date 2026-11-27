<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/services/api'

/**
 * When a project is opened, ADA checks that its main branch is protected (a change only
 * enters it through a reviewed request, green checks). Project created by ADA: it protects it
 * by itself if needed. Adopted project: it proposes it, and the PO decides (it changes the way
 * the whole team of the repository works); a refusal is remembered, and the PO can reconsider.
 */
interface Protection {
  state: 'protected' | 'applied' | 'impossible' | 'to-propose' | 'refused'
  reason: string | null
  link: string
}

const props = defineProps<{ project: string }>()
const protection = ref<Protection | null>(null)
/** After a refusal: the PO asked to see the proposal again. */
const reconsider = ref(false)
const inProgress = ref(false)
const error = ref<string | null>(null)

const filePath = (project: string) => `/projects/${encodeURIComponent(project)}/protection`

watch(
  () => props.project,
  async (project) => {
    protection.value = null
    reconsider.value = false
    error.value = null
    try {
      const result = await api.send<Protection>(filePath(project), {})
      if (props.project === project) protection.value = result
    } catch {
      // Check impossible for now: it will be redone at the next opening, without getting in the way.
    }
  },
  { immediate: true },
)

async function choose(action: 'apply' | 'refuse'): Promise<void> {
  const project = props.project
  inProgress.value = true
  error.value = null
  try {
    const result = await api.send<Protection>(`${filePath(project)}/${action}`, {})
    if (props.project === project) {
      protection.value = result
      reconsider.value = false
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    inProgress.value = false
  }
}
</script>

<template>
  <DsfrAlert
    v-if="protection?.state === 'applied'"
    type="success"
    small
    class="fr-mb-2w"
    description="ADA vient de protéger la branche principale de ce projet sur GitHub : un changement n’y entre plus que par une demande vérifiée, contrôles verts."
  />

  <div v-else-if="protection?.state === 'impossible'" class="fr-mb-2w">
    <DsfrAlert
      type="warning"
      small
      :description="`La branche principale de ce projet n’est pas protégée : quelqu’un qui a accès au dépôt peut y envoyer du code sans vérification. ${protection.reason ?? ''} Un développeur peut créer la règle sur GitHub.`"
    />
    <a class="fr-link fr-link--sm" :href="protection.link" target="_blank" rel="noopener">
      Voir les règles du dépôt<span class="fr-sr-only"> (nouvelle fenêtre)</span>
    </a>
  </div>

  <section
    v-else-if="protection?.state === 'to-propose' || (protection?.state === 'refused' && reconsider)"
    class="fr-callout fr-mb-2w"
    aria-labelledby="protection-title"
  >
    <h2 id="protection-title" class="fr-callout__title fr-h6">Protéger la branche principale ?</h2>
    <p class="fr-callout__text fr-text--sm">
      La branche principale de ce projet n’est pas protégée : quelqu’un qui a accès au dépôt peut y
      envoyer du code sans vérification. Si vous la protégez, chaque changement devra passer par une
      demande vérifiée, contrôles verts.
    </p>
    <p class="fr-text--sm">
      Si d’autres personnes travaillent sur ce projet, prévenez-les : elles ne pourront plus envoyer
      de code directement sur la branche principale.
    </p>
    <DsfrAlert v-if="error" type="error" small :description="error" class="fr-mb-2w" />
    <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--sm">
      <li><DsfrButton label="Protéger la branche" :disabled="inProgress" @click="choose('apply')" /></li>
      <li><DsfrButton secondary label="Ne pas protéger" :disabled="inProgress" @click="choose('refuse')" /></li>
    </ul>
  </section>

  <p v-else-if="protection?.state === 'refused'" class="fr-text--sm fr-mb-2w">
    Branche principale non protégée, à votre demande.
    <DsfrButton tertiary no-outline size="sm" label="Revenir sur ce choix" @click="reconsider = true" />
  </p>
</template>
