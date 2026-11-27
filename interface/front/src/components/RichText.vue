<script setup lang="ts">
import { computed } from 'vue'
import { readRichText } from '@/lib/rich-text'

const props = defineProps<{ text: string }>()
const blocks = computed(() => readRichText(props.text))
</script>

<template>
  <div class="rich-text">
    <template v-for="(block, rank) in blocks" :key="rank">
      <p v-if="block.type === 'subheading'" class="fr-text--bold fr-mb-1w fr-mt-3w">
        <template v-for="(segment, position) in block.segments" :key="position">{{ segment.text }}</template>
      </p>
      <p v-else-if="block.type === 'paragraph'" class="fr-mb-2w">
        <template v-for="(segment, position) in block.segments" :key="position">
          <strong v-if="segment.bold">{{ segment.text }}</strong>
          <code v-else-if="segment.code">{{ segment.text }}</code>
          <template v-else>{{ segment.text }}</template>
        </template>
      </p>
      <component :is="block.ordered ? 'ol' : 'ul'" v-else class="fr-mb-2w">
        <li v-for="(element, number) in block.elements" :key="number">
          <template v-for="(segment, position) in element" :key="position">
            <strong v-if="segment.bold">{{ segment.text }}</strong>
            <code v-else-if="segment.code">{{ segment.text }}</code>
            <template v-else>{{ segment.text }}</template>
          </template>
        </li>
      </component>
    </template>
  </div>
</template>
