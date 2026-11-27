<script setup lang="ts">
import { computed, ref } from 'vue'
import { asLightBulb, tellingEquivalents, formatCo2, formatEnergy, type AdaFootprint } from '@/lib/footprint'

/**
 * Estimated carbon footprint of ADA's usage: as a range, with official ADEME
 * equivalents, and the method, the assumptions and the limits stated frankly.
 */
const props = defineProps<{ footprint: AdaFootprint }>()

const open = ref(-1)
const headers = ['Projet', 'Émissions estimées', 'Soit']
const lines = computed(() =>
  props.footprint.byProject.map(({ project, footprint }) => [project, formatCo2(footprint.co2Grams), tellingEquivalents(footprint.co2Grams, props.footprint.equivalents)[0]]),
)
const telling = computed(() => tellingEquivalents(props.footprint.total.co2Grams, props.footprint.equivalents))
const since = computed(() => (props.footprint.since ? new Date(props.footprint.since).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : null))
const frenchNumber = (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const opus = computed(() => props.footprint.assumptions.models.opus)
</script>

<template>
  <section aria-labelledby="footprint-title">
    <h2 id="footprint-title" class="fr-h4 fr-mt-5w">Empreinte carbone d’ADA</h2>
    <p v-if="!footprint.total.outputTokenCount" class="fr-text--sm">
      Rien de mesuré pour l’instant : l’empreinte se calcule à chaque travail d’ADA à partir de maintenant.
    </p>
    <template v-else>
      <div class="footprint__card">
        <p class="footprint__value">{{ formatCo2(footprint.total.co2Grams) }}</p>
        <p class="fr-mb-1w">
          soit <strong>{{ telling[0] }}</strong>, ou
          <strong>{{ telling[1] }}</strong>
        </p>
        <p class="fr-text--sm fr-mb-0">
          Électricité : {{ formatEnergy(footprint.total.energyWh) }}, soit {{ asLightBulb(footprint.total.energyWh, footprint.equivalents.ledBulbWatts) }}<span v-if="since">, depuis le {{ since }}</span>.
          Estimation en fourchette : la taille des modèles n’est pas publiée.
        </p>
      </div>

      <DsfrTable v-if="lines.length > 1" class="full-width-table fr-mt-3w" title="Empreinte par projet" no-caption :headers="headers" :rows="lines" />

      <DsfrAccordionsGroup v-model="open" class="fr-mt-2w">
        <DsfrAccordion id="footprint-method" title="Comment c’est calculé">
          <p class="fr-text--sm">
            ADA note, à chaque travail, le nombre de tokens produits par chaque modèle (jamais le contenu).
            L’empreinte en est déduite avec la méthode ouverte
            <a href="https://ecologits.ai/latest/methodology/llm_inference/" target="_blank" rel="noopener">EcoLogits<span class="fr-sr-only"> (nouvelle fenêtre)</span></a>,
            qui s’appuie sur la Base Empreinte de l’ADEME : énergie des serveurs et part de leur fabrication.
          </p>
          <ul class="fr-text--sm">
            <li>
              Taille supposée d’Opus : {{ opus?.totalBillions }} milliards de paramètres, {{ opus?.activeBillions.min }} à
              {{ opus?.activeBillions.max }} milliards actifs ({{ opus?.source }}) : c’est l’essentiel de l’écart de la fourchette.
            </li>
            <li>Électricité aux États-Unis, où sont les serveurs : {{ footprint.assumptions.electricityGramsCo2PerKwh }} g CO2e par kWh (Ember 2024, repris par Our World in Data).</li>
            <li>
              Équivalents de l’ADEME (<a href="https://impactco2.fr" target="_blank" rel="noopener">Impact CO2<span class="fr-sr-only"> (nouvelle fenêtre)</span></a>) :
              {{ footprint.equivalents.webSearchGrams }} g par recherche web, {{ footprint.equivalents.streamingHourGrams }} g par heure de streaming vidéo,
              {{ Math.round(footprint.equivalents.carKmGrams) }} g par km en voiture thermique,
              {{ frenchNumber(footprint.equivalents.parisMarseilleReturnTrainGrams / 1000) }} kg pour un aller-retour Paris–Marseille en TGV,
              {{ Math.round(footprint.equivalents.parisNewYorkReturnFlightGrams / 1000) }} kg pour un aller-retour Paris–New York en avion.
              ADA choisit les deux comparaisons les plus parlantes selon la taille du total.
            </li>
            <li>
              L’ampoule traduit l’électricité consommée, pas le CO2 : c’est une hypothèse d’ADA (ampoule LED de {{ footprint.equivalents.ledBulbWatts }} W), pas un chiffre de l’ADEME.
            </li>
          </ul>
          <p class="fr-text--sm fr-mb-1w"><strong>Limites</strong></p>
          <ul class="fr-text--sm">
            <li>Anthropic ne publie ni la taille de ses modèles ni leur consommation : le chiffre sera affiné quand on le saura.</li>
            <li>Seuls les tokens produits comptent (comme EcoLogits) ; la relecture du projet par ADA n’est pas comptée : c’est plutôt une borne basse pour cet usage.</li>
            <li>Ni l’entraînement des modèles, ni votre ordinateur, ni l’aperçu ne sont comptés.</li>
            <li>À titre de comparaison, Google mesure 0,24 Wh pour une question courante à Gemini : les estimations publiques varient beaucoup.</li>
          </ul>
        </DsfrAccordion>
      </DsfrAccordionsGroup>
    </template>
  </section>
</template>

<style scoped>
.footprint__card {
  padding: 1.5rem;
  background: var(--background-alt-green-emeraude);
  border-bottom: 4px solid var(--border-plain-green-emeraude);
}
.footprint__value {
  margin: 0 0 0.25rem;
  font-size: 2rem;
  line-height: 1.1;
  font-weight: 700;
}
</style>
