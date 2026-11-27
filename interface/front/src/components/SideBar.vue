<script setup lang="ts">
import { ref } from 'vue'
import StoryList from '@/components/StoryList.vue'
import DeliveredStories from '@/components/DeliveredStories.vue'
import VersionsPanel from '@/components/VersionsPanel.vue'
import { newIssueLink } from '@/lib/story'
import { useProjetsStore } from '@/stores/projects'
import { useStoriesStore } from '@/stores/stories'

/**
 * Sidebar, Claude style: a new conversation, the projects, then the requests of the
 * open project. Secondary items (GitHub, creation, adoption) are placed at the bottom.
 */
const emit = defineEmits<{
  home: []
  choose: [id: string]
  open: [number: number]
  refresh: []
  newProject: []
  adoptProject: []
  hideProject: []
}>()

const projects = useProjetsStore()
const stories = useStoriesStore()
const areVersionsOpen = ref(-1)
</script>

<template>
  <nav class="sidebar" aria-label="Projets et demandes">
    <DsfrButton
      class="sidebar__new"
      icon="fr-icon-add-line"
      label="Nouvelle conversation"
      :disabled="!projects.currentId"
      @click="emit('home')"
    />

    <h2 class="sidebar__title">Projets</h2>
    <p v-if="projects.loading" class="fr-text--sm">Chargement…</p>
    <ul v-else class="sidebar__list" aria-label="Vos projets">
      <li v-for="project in projects.list" :key="project.id">
        <button type="button" :aria-current="project.id === projects.currentId ? 'true' : undefined" @click="emit('choose', project.id)">
          <span class="fr-icon-folder-2-line fr-icon--sm" aria-hidden="true" />
          <span class="sidebar__name">{{ project.name }}</span>
          <span v-if="project.adoption" class="fr-badge fr-badge--sm fr-badge--warning">reprise</span>
        </button>
      </li>
    </ul>

    <template v-if="projects.current">
      <div class="sidebar__header">
        <h2 id="stories-title" class="sidebar__title" tabindex="-1">Demandes</h2>
        <DsfrButton tertiary no-outline size="sm" icon="fr-icon-refresh-line" label="Actualiser" @click="emit('refresh')" />
      </div>
      <p v-if="stories.loading" class="fr-text--sm">Chargement…</p>
      <DsfrAlert v-else-if="stories.error" type="error" small :description="stories.error" />
      <template v-else>
        <p v-if="stories.todo.length === 0" class="fr-text--sm">Aucune demande pour l’instant.</p>
        <StoryList v-else :stories="stories.todo" :current-number="stories.current?.number ?? null" @open="(number) => emit('open', number)" />
        <DeliveredStories
          v-if="stories.delivered.length > 0"
          :stories="stories.delivered"
          :repository-url="projects.current.url"
          :current-number="stories.current?.number ?? null"
          @open="(number) => emit('open', number)"
        />
      </template>

      <DsfrAccordionsGroup v-if="!projects.current.adoption" v-model="areVersionsOpen" class="fr-mt-2w">
        <DsfrAccordion id="project-versions" title="Versions du projet">
          <VersionsPanel :project="projects.current.id" />
        </DsfrAccordion>
      </DsfrAccordionsGroup>
    </template>

    <ul class="sidebar__footer" aria-label="Autres actions">
      <template v-if="projects.current">
        <li>
          <a class="fr-link fr-link--sm fr-icon-edit-line fr-link--icon-left" :href="newIssueLink(projects.current.url, 'user-story.yml')" target="_blank" rel="noopener">
            Écrire une story sur GitHub<span class="fr-sr-only"> (nouvelle fenêtre)</span>
          </a>
        </li>
        <li>
          <a class="fr-link fr-link--sm fr-icon-error-warning-line fr-link--icon-left" :href="newIssueLink(projects.current.url, 'bug.yml')" target="_blank" rel="noopener">
            Signaler un problème sur GitHub<span class="fr-sr-only"> (nouvelle fenêtre)</span>
          </a>
        </li>
      </template>
      <li><button type="button" class="fr-link fr-link--sm fr-icon-add-line fr-link--icon-left" @click="emit('newProject')">Nouveau projet</button></li>
      <li><button type="button" class="fr-link fr-link--sm fr-icon-download-line fr-link--icon-left" @click="emit('adoptProject')">Reprendre un projet</button></li>
      <li v-if="projects.current">
        <button type="button" class="fr-link fr-link--sm fr-icon-eye-off-line fr-link--icon-left" @click="emit('hideProject')">Masquer le projet</button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}

.sidebar__new {
  width: 100%;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.sidebar__title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-mention-grey);
  margin: 0.75rem 0 0.25rem;
}

.sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sidebar__list li {
  padding: 0;
}

.sidebar__list button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.375rem;
  background: none;
  text-align: left;
  cursor: pointer;
}

.sidebar__list button:hover {
  background: var(--background-default-grey-hover);
}

.sidebar__list button[aria-current='true'] {
  background: var(--background-alt-blue-france);
  font-weight: 700;
}

.sidebar__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__footer {
  list-style: none;
  margin: auto 0 0;
  padding: 1rem 0 0;
  border-top: 1px solid var(--border-default-grey);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sidebar__footer li {
  padding: 0;
}
</style>
