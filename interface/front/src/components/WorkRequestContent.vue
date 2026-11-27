<script setup lang="ts">
/** The request itself, as written by the PO: story, reported bug or free request. */
import type { StoryDetail } from '@/lib/story'

defineProps<{ story: StoryDetail }>()
</script>

<template>
  <section v-if="story.content" aria-labelledby="story-title">
    <h3 id="story-title" class="fr-h6 fr-mb-1w">La story</h3>
    <p class="fr-mb-1w">
      <strong>En tant que</strong> {{ story.content.role }},<br />
      <strong>je veux</strong> {{ story.content.need }},<br />
      <strong>afin de</strong> {{ story.content.benefit }}.
    </p>
    <p class="fr-text--bold fr-mb-1v">Critères d’acceptation</p>
    <ul>
      <li v-for="criterion in story.content.criteria" :key="criterion">{{ criterion }}</li>
    </ul>
  </section>
  <section v-else-if="story.bugContent" aria-labelledby="bug-title">
    <h3 id="bug-title" class="fr-h6 fr-mb-1w">Le problème signalé</h3>
    <dl class="fr-mb-2w">
      <dt><strong>Ce qui se passe</strong></dt>
      <dd>{{ story.bugContent.observed }}</dd>
      <dt><strong>Ce qui devrait se passer</strong></dt>
      <dd>{{ story.bugContent.expected }}</dd>
      <dt><strong>Comment le reproduire</strong></dt>
      <dd class="feed-pre">{{ story.bugContent.steps }}</dd>
      <template v-if="story.bugContent.screen">
        <dt><strong>Écran concerné</strong></dt>
        <dd>{{ story.bugContent.screen }}</dd>
      </template>
    </dl>
  </section>
  <section v-else-if="story.freeContent && story.type !== 'conversation'" aria-labelledby="free-title">
    <h3 id="free-title" class="fr-h6 fr-mb-1w">Demande libre (hors story)</h3>
    <p class="fr-text--xs fr-mb-1w">
      Enregistrée sur GitHub comme demande n° {{ story.number }} « mode libre ».
    </p>
    <p class="feed-pre">{{ story.freeContent }}</p>
  </section>
  <p v-else class="fr-text--sm">{{ story.rawText }}</p>
</template>
