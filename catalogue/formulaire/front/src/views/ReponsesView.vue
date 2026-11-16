<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ADRESSE_EXPORT_CSV, lireReponses, type Reponse, type Valeur } from '@/services/formulaire'
import { useFormulaireStore } from '@/stores/formulaire'

const magasin = useFormulaireStore()
const { formulaire } = storeToRefs(magasin)
const reponses = ref<Reponse[] | null>(null)
const erreur = ref<string | null>(null)

onMounted(async () => {
  try {
    await magasin.charger()
    reponses.value = await lireReponses()
  } catch {
    erreur.value = 'Les réponses n’ont pas pu être chargées. Réessayez dans quelques instants.'
  }
})

const dateLisible = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' })
const texte = (valeur: Valeur | undefined) => (Array.isArray(valeur) ? valeur.join(', ') : String(valeur ?? ''))

const entetes = computed(() => ['N°', 'Reçue le', ...(formulaire.value?.questions.map((question) => question.libelle) ?? [])])
const lignes = computed(() =>
  (reponses.value ?? []).map((reponse) => [
    String(reponse.id),
    dateLisible(reponse.recueillieLe),
    ...(formulaire.value?.questions.map((question) => texte(reponse.valeurs[question.id])) ?? []),
  ]),
)
</script>

<template>
  <h1>Réponses</h1>
  <DsfrAlert v-if="erreur" type="error" title="Réponses indisponibles" :description="erreur" />
  <p v-else-if="reponses === null" role="status">Chargement des réponses…</p>
  <template v-else>
    <p role="status">{{ reponses.length }} réponse(s) reçue(s).</p>
    <p v-if="reponses.length > 0">
      <a class="fr-btn fr-btn--secondary fr-icon-download-line fr-btn--icon-left" :href="ADRESSE_EXPORT_CSV" download>
        Exporter les réponses (CSV, séparateur point-virgule)
      </a>
    </p>
    <DsfrTable v-if="reponses.length > 0" title="Réponses reçues, de la plus récente à la plus ancienne" :headers="entetes" :rows="lignes" />
  </template>
</template>
