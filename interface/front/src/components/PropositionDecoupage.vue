<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StoryProposee } from '@/lib/story'

/**
 * Découpage proposé par l'assistant (#36) : le PO coche les stories qu'ADA créera pour lui. Les
 * stories créées sont relues côté serveur dans la proposition : l'écran n'envoie que les numéros cochés.
 */
const props = defineProps<{ stories: StoryProposee[]; designation: string; actionEnCours?: boolean }>()
const emit = defineEmits<{ creer: [indices: number[]]; autreDecoupage: [] }>()

const cochees = ref<number[]>(props.stories.map((_, rang) => rang))
const erreur = ref('')
const libelleBouton = computed(() =>
  cochees.value.length > 1 ? `Créer les ${cochees.value.length} stories` : 'Créer la story',
)

function creer(): void {
  if (!cochees.value.length) {
    erreur.value = 'Cochez au moins une story'
    return
  }
  erreur.value = ''
  emit('creer', [...cochees.value].sort((premier, second) => premier - second))
}
</script>

<template>
  <form novalidate class="fr-mt-2w" aria-labelledby="titre-decoupage" @submit.prevent="creer">
    <h4 id="titre-decoupage" class="fr-h6">Stories proposées</h4>
    <p class="fr-text--sm">
      Cochez celles à créer. Elles seront réalisées une par une ; cette demande restera leur
      demande parent, et chaque story s’y cochera une fois livrée.
    </p>
    <ul class="fr-p-0 decoupage">
      <li v-for="(story, rang) in stories" :key="story.titre" class="fr-mb-2w">
        <div class="fr-checkbox-group">
          <input :id="`story-proposee-${rang}`" v-model="cochees" type="checkbox" :value="rang" :aria-describedby="`story-proposee-${rang}-detail`" />
          <label class="fr-label" :for="`story-proposee-${rang}`">{{ rang + 1 }}. {{ story.titre }}</label>
        </div>
        <div :id="`story-proposee-${rang}-detail`" class="fr-ml-4w fr-text--sm">
          <p class="fr-mb-1v">
            En tant que {{ story.role }}, je veux {{ story.besoin }}, afin de {{ story.benefice }}.
          </p>
          <ul>
            <li v-for="critere in story.criteres" :key="critere">{{ critere }}</li>
          </ul>
        </div>
      </li>
    </ul>
    <p v-if="erreur" class="fr-error-text" role="alert">{{ erreur }}</p>
    <p id="decoupage-enregistrement" class="fr-text--sm fr-mb-2w">
      <span class="fr-icon-information-line fr-icon--sm" aria-hidden="true" />
      <strong>ADA créera ces stories sur GitHub, à votre nom</strong>, au format du formulaire de
      story, et les reliera à {{ designation }}.
    </p>
    <ul class="fr-btns-group fr-btns-group--inline-md">
      <li><DsfrButton type="submit" :label="libelleBouton" aria-describedby="decoupage-enregistrement" :disabled="actionEnCours" /></li>
      <li>
        <DsfrButton type="button" secondary label="Demander un autre découpage" :disabled="actionEnCours" @click="emit('autreDecoupage')" />
      </li>
    </ul>
  </form>
</template>

<style scoped>
.decoupage {
  list-style: none;
}
</style>
