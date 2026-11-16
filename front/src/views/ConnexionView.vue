<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const erreur = computed(() => route.query.erreur)
</script>

<template>
  <div class="fr-grid-row fr-grid-row--center">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <h1>Atelier PO</h1>
      <p class="fr-text--lead">
        Décrivez vos besoins sous forme de user stories et voyez votre produit se construire,
        au même endroit.
      </p>
      <DsfrAlert
        v-if="erreur"
        type="error"
        small
        description="La connexion n’a pas abouti. Réessayez."
        class="fr-mb-3w"
      />
      <a class="fr-btn fr-btn--lg fr-icon-github-fill fr-btn--icon-left" href="/api/auth/github">
        Se connecter avec GitHub
      </a>
      <p class="fr-text--sm fr-mt-3w">
        Vos stories sont enregistrées comme des « issues » dans les dépôts GitHub de vos projets,
        en votre nom.
      </p>
    </div>
  </div>
</template>
