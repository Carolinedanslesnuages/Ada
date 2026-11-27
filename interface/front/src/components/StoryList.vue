<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { STATUS_LABELS, toLaunchOrRelaunch, orderToLaunch, type StorySummary } from '@/lib/story'

/**
 * Stories of the project: the ones in progress (with the assistant, to review…) stay visible; the ones
 * to launch are placed in an accordion, so that the screen does not scroll when there are many.
 */
const props = defineProps<{ stories: StorySummary[]; currentNumber?: number | null }>()
const emit = defineEmits<{ open: [number: number] }>()

const inProgress = computed(() => props.stories.filter((story) => !toLaunchOrRelaunch(story)))
/** In the order advised by ADA; the first ready one is the next to launch. */
const toLaunch = computed(() => orderToLaunch(props.stories.filter(toLaunchOrRelaunch)))
const next = computed(() => toLaunch.value.find((story) => story.ready && story.status === 'new') ?? null)
const titleToLaunch = computed(() => `À lancer (${toLaunch.value.length})`)

/** Closed by default; opened automatically when the displayed story is part of it. */
const openAccordion = ref(-1)
watch(
  () => props.currentNumber,
  (number) => {
    if (number && toLaunch.value.some((story) => story.number === number)) openAccordion.value = 0
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <ul v-if="inProgress.length > 0" class="story-list" aria-label="Stories en cours">
      <li v-for="story in inProgress" :key="story.number">
        <button
          type="button"
          :aria-current="story.number === currentNumber ? 'true' : undefined"
          @click="emit('open', story.number)"
        >
          <span>
            <span class="fr-text--xs fr-mb-0">#{{ story.number }}</span>
            <span v-if="story.type === 'bug'" class="fr-text--xs fr-mb-0"> Problème :</span>
            <span v-else-if="story.type === 'free'" class="fr-text--xs fr-mb-0"> Mode libre :</span>
            {{ story.title }}
          </span>
          <DsfrBadge
            :label="STATUS_LABELS[story.status].label"
            :type="STATUS_LABELS[story.status].type"
            small
            no-icon
          />
        </button>
      </li>
    </ul>

    <div v-if="next" class="next-story fr-mt-2w">
      <p class="fr-text--sm fr-text--bold fr-mb-1v">Prochaine story conseillée</p>
      <button
        type="button"
        class="next-story__button"
        :aria-current="next.number === currentNumber ? 'true' : undefined"
        @click="emit('open', next.number)"
      >
        <span class="fr-text--xs fr-mb-0">#{{ next.number }}</span>
        <span v-if="next.type === 'bug'" class="fr-text--xs fr-mb-0"> Problème :</span>
        {{ next.title }}
      </button>
    </div>

    <DsfrAccordionsGroup v-if="toLaunch.length > 0" v-model="openAccordion" class="fr-mt-1w">
      <DsfrAccordion id="stories-to-launch" :title="titleToLaunch">
        <p class="fr-text--xs fr-mb-1w">
          Dans l’ordre conseillé par ADA : les stories prêtes d’abord, les problèmes signalés en
          premier, puis l’ordre de chaque découpage, enfin les plus anciennes.
        </p>
        <ol class="story-list" aria-label="Stories à lancer, dans l’ordre conseillé">
          <li v-for="story in toLaunch" :key="story.number">
            <button
              type="button"
              :aria-current="story.number === currentNumber ? 'true' : undefined"
              @click="emit('open', story.number)"
            >
              <span>
                <span class="fr-text--xs fr-mb-0">#{{ story.number }}</span>
                <span v-if="story.type === 'bug'" class="fr-text--xs fr-mb-0"> Problème :</span>
                <span v-else-if="story.type === 'free'" class="fr-text--xs fr-mb-0"> Mode libre :</span>
                {{ story.title }}
              </span>
              <DsfrBadge
                v-if="!story.ready"
                label="À corriger sur GitHub"
                type="warning"
                small
                no-icon
              />
              <DsfrBadge
                v-else
                :label="STATUS_LABELS[story.status].label"
                :type="STATUS_LABELS[story.status].type"
                small
                no-icon
              />
            </button>
          </li>
        </ol>
      </DsfrAccordion>
    </DsfrAccordionsGroup>
  </div>
</template>

<style scoped>
.next-story__button {
  width: 100%;
  text-align: left;
  padding: 0.75rem;
  border: 1px solid var(--border-action-high-blue-france);
  background-color: var(--background-alt-blue-france);
  cursor: pointer;
}
.next-story__button[aria-current='true'] {
  box-shadow: inset 4px 0 0 var(--border-action-high-blue-france);
}
</style>
