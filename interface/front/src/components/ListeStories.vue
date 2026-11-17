<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LIBELLES_STATUT, type ResumeStory } from '@/lib/story'

/**
 * Stories du projet : celles en cours (avec l'assistant, à vérifier…) restent visibles ; celles
 * à lancer sont rangées dans un accordéon, pour ne pas faire défiler l'écran quand il y en a beaucoup.
 */
const props = defineProps<{ stories: ResumeStory[]; numeroCourant?: number | null }>()
const emit = defineEmits<{ ouvrir: [numero: number] }>()

const enCours = computed(() => props.stories.filter((story) => story.statut !== 'nouvelle'))
const aLancer = computed(() => props.stories.filter((story) => story.statut === 'nouvelle'))
const titreALancer = computed(() => `À lancer (${aLancer.value.length})`)

/** Fermé par défaut ; ouvert d'office quand la story affichée en fait partie. */
const accordeonOuvert = ref(-1)
watch(
  () => props.numeroCourant,
  (numero) => {
    if (numero && aLancer.value.some((story) => story.numero === numero)) accordeonOuvert.value = 0
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <ul v-if="enCours.length > 0" class="liste-stories" aria-label="Stories en cours">
      <li v-for="story in enCours" :key="story.numero">
        <button
          type="button"
          :aria-current="story.numero === numeroCourant ? 'true' : undefined"
          @click="emit('ouvrir', story.numero)"
        >
          <span>
            <span class="fr-text--xs fr-mb-0">#{{ story.numero }}</span>
            <span v-if="story.type === 'bug'" class="fr-text--xs fr-mb-0"> Problème :</span>
            <span v-else-if="story.type === 'libre'" class="fr-text--xs fr-mb-0"> Mode libre :</span>
            {{ story.titre }}
          </span>
          <DsfrBadge
            :label="LIBELLES_STATUT[story.statut].libelle"
            :type="LIBELLES_STATUT[story.statut].type"
            small
            no-icon
          />
        </button>
      </li>
    </ul>

    <DsfrAccordionsGroup v-if="aLancer.length > 0" v-model="accordeonOuvert" class="fr-mt-1w">
      <DsfrAccordion id="stories-a-lancer" :title="titreALancer">
        <ul class="liste-stories" aria-label="Stories à lancer">
          <li v-for="story in aLancer" :key="story.numero">
            <button
              type="button"
              :aria-current="story.numero === numeroCourant ? 'true' : undefined"
              @click="emit('ouvrir', story.numero)"
            >
              <span>
                <span class="fr-text--xs fr-mb-0">#{{ story.numero }}</span>
                <span v-if="story.type === 'bug'" class="fr-text--xs fr-mb-0"> Problème :</span>
                <span v-else-if="story.type === 'libre'" class="fr-text--xs fr-mb-0"> Mode libre :</span>
                {{ story.titre }}
              </span>
              <DsfrBadge
                v-if="!story.prete"
                label="À corriger sur GitHub"
                type="warning"
                small
                no-icon
              />
              <DsfrBadge
                v-else
                :label="LIBELLES_STATUT[story.statut].libelle"
                :type="LIBELLES_STATUT[story.statut].type"
                small
                no-icon
              />
            </button>
          </li>
        </ul>
      </DsfrAccordion>
    </DsfrAccordionsGroup>
  </div>
</template>
