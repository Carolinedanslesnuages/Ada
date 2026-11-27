<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const message = computed(() =>
  route.query.error === 'not-allowed'
    ? 'Votre compte GitHub n’est pas autorisé à utiliser cet atelier. Demandez l’accès à son administrateur.'
    : route.query.error === 'github'
      ? 'GitHub a refusé la connexion de l’atelier (configuration de l’application GitHub). Prévenez son administrateur.'
      : route.query.error
        ? 'La connexion n’a pas abouti. Réessayez.'
      : null,
)

const steps = [
  {
    title: 'Créez votre projet',
    text: 'Quelques questions suffisent : son nom, son objectif, le type de produit.',
  },
  {
    title: 'Écrivez vos stories',
    text: 'Un rôle, un besoin, un bénéfice, et quatre critères d’acceptation au maximum.',
  },
  {
    title: 'Validez le plan',
    text: 'ADA pose ses questions, puis vous propose un plan avant de commencer.',
  },
  {
    title: 'Regardez le résultat',
    text: 'L’aperçu de votre produit se met à jour à côté de vos stories.',
  },
  {
    title: 'Publiez la version',
    text: 'Quand tous les contrôles sont au vert, vous validez la version depuis ADA.',
  },
]

const guarantees = [
  {
    icon: 'fr-icon-checkbox-circle-line',
    title: 'Des tests à chaque story',
    text: 'Chaque fonctionnalité arrive avec ses tests, écrits avant le code.',
  },
  {
    icon: 'fr-icon-eye-line',
    title: 'L’accessibilité vérifiée',
    text: 'Contrôle automatique et grille RGAA 4.1.2 complète, à chaque story.',
  },
  {
    icon: 'fr-icon-lock-line',
    title: 'Un travail cloisonné',
    text: 'ADA ne travaille que dans votre projet : aucun secret, aucune donnée réelle.',
  },
  {
    icon: 'fr-icon-git-pull-request-line',
    title: 'Des versions maîtrisées',
    text: 'Rien ne change sans votre accord ; chaque version a son récapitulatif.',
  },
]
</script>

<template>
  <div class="home">
    <section class="home__hero fr-grid-row fr-grid-row--gutters fr-grid-row--middle">
      <div class="fr-col-12 fr-col-lg-6">
        <p class="fr-badge fr-badge--info fr-badge--no-icon fr-mb-2w">Atelier de Développement Assisté</p>
        <h1 class="fr-mb-2w"><img class="home__logo" src="/logo-ada-capitales.svg" alt="ADA" /></h1>
        <p class="fr-text--lead fr-mb-2w">
          Un outil pour les non-développeurs : décrivez votre besoin, ADA réalise
          votre POC et vous le voyez se construire.
        </p>
        <DsfrAlert v-if="message" type="error" small :description="message" class="fr-mb-3w" />
        <a class="fr-btn fr-btn--lg fr-icon-github-fill fr-btn--icon-left" href="/api/auth/github">
          Se connecter avec GitHub
        </a>
        <p class="fr-text--sm fr-mt-3w fr-mb-0">
          Vos stories sont enregistrées comme des « issues » dans les dépôts GitHub de vos projets,
          en votre nom.
        </p>
      </div>
      <div class="fr-col-12 fr-col-lg-6">
        <div class="home__mockup" aria-hidden="true">
          <div class="home__mockup-bar">ADA · mon-projet</div>
          <div class="home__mockup-body">
            <div class="home__mockup-stories">
              <div class="home__story">
                <span class="fr-badge fr-badge--success fr-badge--sm">Livrée</span>
                <span>Voir les salles libres</span>
              </div>
              <div class="home__story">
                <span class="fr-badge fr-badge--info fr-badge--sm">En cours</span>
                <span>Réserver une salle</span>
              </div>
              <div class="home__story">
                <span class="fr-badge fr-badge--new fr-badge--sm">Plan à valider</span>
                <span>Annuler une réservation</span>
              </div>
            </div>
            <div class="home__mockup-preview">
              <span class="home__block home__block--title"></span>
              <span class="home__block home__block--large"></span>
              <span class="home__block"></span>
              <span class="home__block home__block--short"></span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="home__section" aria-labelledby="steps-title">
      <h2 id="steps-title">Comment ça marche</h2>
      <ol class="home__steps">
        <li v-for="(step, i) in steps" :key="step.title" class="home__step">
          <span class="home__number" aria-hidden="true">{{ i + 1 }}</span>
          <h3 class="fr-h6 fr-mb-1w">{{ step.title }}</h3>
          <p class="fr-text--sm fr-mb-0">{{ step.text }}</p>
        </li>
      </ol>
    </section>

    <section class="home__section home__section--alt" aria-labelledby="guarantees-title">
      <h2 id="guarantees-title">Ce qu’ADA garantit</h2>
      <p class="fr-mb-4w">
        La qualité ne dépend pas de vos connaissances techniques : elle est inscrite dans l’atelier
        et contrôlée automatiquement.
      </p>
      <ul class="home__guarantees fr-grid-row fr-grid-row--gutters">
        <li v-for="g in guarantees" :key="g.title" class="fr-col-12 fr-col-md-6 fr-col-lg-3">
          <div class="home__guarantee">
            <span :class="[g.icon, 'home__icon']" aria-hidden="true"></span>
            <h3 class="fr-h6 fr-mb-1w">{{ g.title }}</h3>
            <p class="fr-text--sm fr-mb-0">{{ g.text }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section class="home__section home__end" aria-labelledby="start-title">
      <h2 id="start-title">Prêt à commencer ?</h2>
      <p>Il vous suffit d’un compte GitHub autorisé par l’administrateur de l’atelier.</p>
      <a class="fr-btn fr-btn--secondary fr-icon-github-fill fr-btn--icon-left" href="/api/auth/github">
        Se connecter avec GitHub
      </a>
    </section>
  </div>
</template>

<style scoped>
.home__logo {
  display: block;
  width: 13rem;
  max-width: 100%;
  height: auto;
}

.home {
  max-width: 78rem;
  margin: 0 auto;
}

.home__hero {
  padding: 2rem 0 3rem;
}

.home__section {
  padding: 3rem 0;
  border-top: 1px solid var(--border-default-grey);
}

.home__section--alt {
  background-color: var(--background-alt-blue-france);
  border-top: none;
  padding: 3rem 2rem;
}

/* Decorative mockup of the workshop */
.home__mockup {
  border: 1px solid var(--border-default-grey);
  border-radius: 0.5rem;
  overflow: hidden;
  background-color: var(--background-default-grey);
  box-shadow: 0 6px 18px rgb(0 0 18 / 16%);
}

.home__mockup-bar {
  background-color: var(--background-action-high-blue-france);
  color: var(--text-inverted-blue-france);
  font-weight: 700;
  padding: 0.75rem 1rem;
}

.home__mockup-body {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  min-height: 16rem;
}

.home__mockup-stories {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border-right: 1px solid var(--border-default-grey);
}

.home__story {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  background-color: var(--background-alt-grey);
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.home__mockup-preview {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background-color: var(--background-alt-blue-france);
}

.home__block {
  display: block;
  height: 1.5rem;
  border-radius: 0.25rem;
  background-color: var(--background-contrast-blue-france);
}

.home__block--title {
  width: 60%;
  background-color: var(--background-action-low-blue-france);
}

.home__block--large {
  height: 6rem;
}

.home__block--short {
  width: 45%;
}

/* Étapes */
.home__steps {
  list-style: none;
  padding: 0;
  margin: 2rem 0 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1.5rem;
}

.home__step {
  list-style: none;
  margin: 0;
  padding: 1rem 0 0;
  border-top: 4px solid var(--border-action-high-blue-france);
}

.home__step::marker {
  content: none;
}

.home__number {
  display: block;
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1;
  color: var(--text-action-high-blue-france);
  margin-bottom: 0.75rem;
}

/* Garanties */
.home__guarantees {
  list-style: none;
  padding: 0;
  margin: 0;
}

.home__guarantees li {
  padding-bottom: 0;
}

.home__guarantee {
  height: 100%;
  padding: 1.5rem;
  background-color: var(--background-default-grey);
  border-bottom: 4px solid var(--border-action-high-blue-france);
}

.home__icon {
  display: block;
  color: var(--text-action-high-blue-france);
  margin-bottom: 0.75rem;
}

.home__icon::before {
  --icon-size: 2rem;
}

.home__end {
  text-align: center;
}

@media (max-width: 62em) {
  .home__steps {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 36em) {
  .home__steps {
    grid-template-columns: 1fr;
  }

  .home__mockup-body {
    grid-template-columns: 1fr;
  }

  .home__mockup-stories {
    border-right: none;
  }
}
</style>
