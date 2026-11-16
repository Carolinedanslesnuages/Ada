<script setup lang="ts">
defineProps<{ projet: string | null }>()
</script>

<template>
  <section class="atelier__panneau" aria-labelledby="titre-apercu">
    <h2 id="titre-apercu" class="fr-h4 fr-mb-0">Aperçu</h2>
    <div class="apercu">
      <DsfrAlert
        type="info"
        small
        :description="
          projet
            ? `L’aperçu en direct de « ${projet} » s’affichera ici (prochaine étape).`
            : 'Choisissez un projet pour afficher son aperçu.'
        "
      />
    </div>
  </section>
</template>
