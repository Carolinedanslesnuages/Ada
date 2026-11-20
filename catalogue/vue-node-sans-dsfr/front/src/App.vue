<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <a class="evitement" href="#contenu">Aller au contenu</a>
  <header class="entete">
    <div class="conteneur">
      <RouterLink to="/" class="nom-service">__NOM_PROJET__</RouterLink>
      <p class="baseline">__BASELINE__</p>
    </div>
  </header>
  <main id="contenu" class="conteneur contenu" tabindex="-1">
    <RouterView />
  </main>
  <footer class="pied">
    <div class="conteneur">
      <p>__NOM_PROJET__</p>
    </div>
  </footer>
</template>
