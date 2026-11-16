<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const message = computed(() =>
  route.query.erreur === 'non-autorise'
    ? 'Votre compte GitHub n’est pas autorisé à utiliser cet atelier. Demandez l’accès à son administrateur.'
    : route.query.erreur === 'github'
      ? 'GitHub a refusé la connexion de l’atelier (configuration de l’application GitHub). Prévenez son administrateur.'
      : route.query.erreur
        ? 'La connexion n’a pas abouti. Réessayez.'
      : null,
)
</script>

<template>
  <div class="fr-grid-row fr-grid-row--center">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <h1>Atelier PO</h1>
      <p class="fr-text--lead">
        Décrivez vos besoins sous forme de user stories et voyez votre produit se construire,
        au même endroit.
      </p>
      <DsfrAlert v-if="message" type="error" small :description="message" class="fr-mb-3w" />
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
