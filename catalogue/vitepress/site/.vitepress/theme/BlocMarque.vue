<script setup lang="ts">
/** Bloc-marque de l'État (« République française »), avant le nom du site, comme dans le DSFR. */
</script>

<template>
  <span class="bloc-marque" aria-hidden="true">République<br />française</span>
</template>

<style scoped>
.bloc-marque {
  display: inline-block;
  margin-right: 0.75rem;
  padding-right: 0.75rem;
  border-right: 1px solid var(--vp-c-divider);
  font-weight: 700;
  font-size: 0.7rem;
  line-height: 1.1;
  text-transform: uppercase;
  color: var(--vp-c-text-1);
}
</style>
