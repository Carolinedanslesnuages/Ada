<script setup lang="ts">
import type { CreationResult } from '@/lib/project'

defineProps<{ result: CreationResult }>()
const emit = defineEmits<{ close: []; poll: [number: number] }>()
</script>

<template>
  <section aria-labelledby="result-title">
    <h2 id="result-title" class="fr-h4">Projet « {{ result.project.name }} » créé</h2>
    <DsfrAlert
      type="success"
      small
      description="Le dépôt est prêt sur GitHub, avec ses tests, ses contrôles et sa première version."
    />
    <p v-if="result.idea" class="fr-mt-2w">
      <strong>Votre idée est enregistrée (demande n° {{ result.idea }}).</strong> ADA l’étudie :
      il va vous poser ses questions, puis vous proposer l’objectif et les premières stories à valider.
    </p>
    <p v-else class="fr-mt-2w">Vous pouvez écrire votre première story, ou « Prompter » une demande libre.</p>

    <div class="fr-mt-3w" role="status">
      <h3 class="fr-h6">Réglages GitHub</h3>
      <ul>
        <li>
          Versions automatiques :
          <strong>{{ result.settings.automaticVersions.state === 'done' ? 'activées' : 'à activer' }}</strong>
        </li>
        <li>
          Protection de la branche principale :
          <strong>{{ result.settings.mainProtection.state === 'done' ? 'activée' : 'à activer' }}</strong>
        </li>
      </ul>
    </div>

    <div v-if="result.settings.automaticVersions.state === 'to-do'" class="fr-callout fr-mt-2w">
      <h3 class="fr-callout__title fr-h6">Autoriser les versions automatiques (une fois)</h3>
      <ol class="fr-callout__text fr-text--sm">
        <li>
          Ouvrez
          <a :href="result.settings.automaticVersions.link" target="_blank" rel="noopener">
            les réglages Actions du dépôt<span class="fr-sr-only"> (nouvelle fenêtre)</span>
          </a>.
        </li>
        <li>
          Tout en bas, <strong>Workflow permissions</strong> : cochez <strong>Read and write
          permissions</strong> et <strong>Allow GitHub Actions to create and approve pull
          requests</strong>, puis <strong>Save</strong>.
        </li>
        <li>Cases grisées : un administrateur de l’organisation doit l’autoriser.</li>
      </ol>
    </div>

    <div v-if="result.settings.mainProtection.state === 'to-do'" class="fr-callout fr-mt-2w">
      <h3 class="fr-callout__title fr-h6">Protéger la branche principale</h3>
      <p class="fr-callout__text fr-text--sm">
        GitHub n’a pas accepté la protection automatique. Sur un compte personnel gratuit, elle
        n’existe pas pour les dépôts privés : l’atelier n’autorisera de toute façon la
        fusion que lorsque tous les contrôles sont verts. Sinon, créez une règle depuis
        <a :href="result.settings.mainProtection.link" target="_blank" rel="noopener">
          les règles du dépôt<span class="fr-sr-only"> (nouvelle fenêtre)</span>
        </a>
        (voir le guide PO).
      </p>
    </div>

    <DsfrButton
      v-if="result.idea"
      class="fr-mt-3w"
      label="Suivre ADA sur mon idée"
      @click="emit('poll', result.idea)"
    />
    <DsfrButton v-else class="fr-mt-3w" label="Écrire la première story" @click="emit('close')" />
  </section>
</template>
