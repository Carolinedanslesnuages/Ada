<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/services/api'

/**
 * À l'ouverture d'un projet, ADA vérifie que sa branche principale est protégée (un changement n'y
 * entre que par une demande vérifiée, contrôles verts) et la protège si besoin. Le PO est prévenu
 * quand ADA vient de la protéger, ou quand GitHub ne le permet pas.
 */
interface Protection {
  etat: 'protegee' | 'posee' | 'impossible' | 'non-geree'
  raison: string | null
  lien: string
}

const props = defineProps<{ projet: string }>()
const protection = ref<Protection | null>(null)

watch(
  () => props.projet,
  async (projet) => {
    protection.value = null
    try {
      const resultat = await api.envoyer<Protection>(`/projets/${encodeURIComponent(projet)}/protection`, {})
      if (props.projet === projet) protection.value = resultat
    } catch {
      // Vérification impossible pour l'instant : elle sera refaite à la prochaine ouverture, sans gêner le travail.
    }
  },
  { immediate: true },
)
</script>

<template>
  <DsfrAlert
    v-if="protection?.etat === 'posee'"
    type="success"
    small
    class="fr-mb-2w"
    description="ADA vient de protéger la branche principale de ce projet sur GitHub : un changement n’y entre plus que par une demande vérifiée, contrôles verts."
  />
  <div v-else-if="protection?.etat === 'impossible'" class="fr-mb-2w">
    <DsfrAlert
      type="warning"
      small
      :description="`La branche principale de ce projet n’est pas protégée : quelqu’un qui a accès au dépôt peut y envoyer du code sans vérification. ${protection.raison ?? ''} Un développeur peut créer la règle sur GitHub.`"
    />
    <a class="fr-link fr-link--sm" :href="protection.lien" target="_blank" rel="noopener">
      Voir les règles du dépôt<span class="fr-sr-only"> (nouvelle fenêtre)</span>
    </a>
  </div>
</template>
