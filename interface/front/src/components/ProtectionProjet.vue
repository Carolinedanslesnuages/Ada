<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/services/api'

/**
 * À l'ouverture d'un projet, ADA vérifie que sa branche principale est protégée (un changement n'y
 * entre que par une demande vérifiée, contrôles verts). Projet créé par ADA : elle la protège
 * d'elle-même si besoin. Projet repris : elle le propose, et le PO décide (cela change la façon de
 * travailler de toute l'équipe du dépôt) ; un refus est retenu, et le PO peut revenir sur son choix.
 */
interface Protection {
  etat: 'protegee' | 'posee' | 'impossible' | 'a-proposer' | 'refusee'
  raison: string | null
  lien: string
}

const props = defineProps<{ projet: string }>()
const protection = ref<Protection | null>(null)
/** Après un refus : le PO a demandé à revoir la proposition. */
const reconsiderer = ref(false)
const enCours = ref(false)
const erreur = ref<string | null>(null)

const chemin = (projet: string) => `/projets/${encodeURIComponent(projet)}/protection`

watch(
  () => props.projet,
  async (projet) => {
    protection.value = null
    reconsiderer.value = false
    erreur.value = null
    try {
      const resultat = await api.envoyer<Protection>(chemin(projet), {})
      if (props.projet === projet) protection.value = resultat
    } catch {
      // Vérification impossible pour l'instant : elle sera refaite à la prochaine ouverture, sans gêner le travail.
    }
  },
  { immediate: true },
)

async function choisir(action: 'poser' | 'refuser'): Promise<void> {
  const projet = props.projet
  enCours.value = true
  erreur.value = null
  try {
    const resultat = await api.envoyer<Protection>(`${chemin(projet)}/${action}`, {})
    if (props.projet === projet) {
      protection.value = resultat
      reconsiderer.value = false
    }
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    enCours.value = false
  }
}
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

  <section
    v-else-if="protection?.etat === 'a-proposer' || (protection?.etat === 'refusee' && reconsiderer)"
    class="fr-callout fr-mb-2w"
    aria-labelledby="titre-protection"
  >
    <h2 id="titre-protection" class="fr-callout__title fr-h6">Protéger la branche principale ?</h2>
    <p class="fr-callout__text fr-text--sm">
      La branche principale de ce projet n’est pas protégée : quelqu’un qui a accès au dépôt peut y
      envoyer du code sans vérification. Si vous la protégez, chaque changement devra passer par une
      demande vérifiée, contrôles verts.
    </p>
    <p class="fr-text--sm">
      Si d’autres personnes travaillent sur ce projet, prévenez-les : elles ne pourront plus envoyer
      de code directement sur la branche principale.
    </p>
    <DsfrAlert v-if="erreur" type="error" small :description="erreur" class="fr-mb-2w" />
    <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--sm">
      <li><DsfrButton label="Protéger la branche" :disabled="enCours" @click="choisir('poser')" /></li>
      <li><DsfrButton secondary label="Ne pas protéger" :disabled="enCours" @click="choisir('refuser')" /></li>
    </ul>
  </section>

  <p v-else-if="protection?.etat === 'refusee'" class="fr-text--sm fr-mb-2w">
    Branche principale non protégée, à votre demande.
    <DsfrButton tertiary no-outline size="sm" label="Revenir sur ce choix" @click="reconsiderer = true" />
  </p>
</template>
