<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, ErreurApi } from '@/services/api'

/** « Mon modèle » : le modèle de langage avec lequel ADA travaille pour l'utilisateur (adresse, clé, nom). */
interface ModeleVu {
  configure: boolean
  adresse: string
  modele: string
  /** Derniers caractères de la clé : la clé elle-même n'est jamais renvoyée. */
  cleFin: string | null
  parDefaut: string | null
}
interface ResultatTest {
  ok: boolean
  appelsOutils: boolean
  message: string
}

const vu = ref<ModeleVu | null>(null)
const adresse = ref('')
const cle = ref('')
const modele = ref('')
const erreurs = ref<Record<string, string>>({})
const erreurGenerale = ref<string | null>(null)
const confirmation = ref<string | null>(null)
const test = ref<ResultatTest | null>(null)
const enCours = ref<'enregistrer' | 'tester' | 'retirer' | null>(null)

function appliquer(valeur: ModeleVu): void {
  vu.value = valeur
  adresse.value = valeur.adresse
  modele.value = valeur.modele
  cle.value = ''
}

const saisie = () => ({ adresse: adresse.value, cle: cle.value, modele: modele.value })

async function agir(action: 'enregistrer' | 'tester' | 'retirer', travail: () => Promise<void>): Promise<void> {
  enCours.value = action
  erreurs.value = {}
  erreurGenerale.value = null
  confirmation.value = null
  if (action !== 'tester') test.value = null
  try {
    await travail()
  } catch (e) {
    if (e instanceof ErreurApi && Object.keys(e.erreurs).length > 0) erreurs.value = e.erreurs
    else erreurGenerale.value = (e as Error).message
  } finally {
    enCours.value = null
  }
}

onMounted(async () => {
  try {
    appliquer(await api.lire<ModeleVu>('/modele'))
  } catch (e) {
    erreurGenerale.value = (e as Error).message
  }
})

const enregistrer = () =>
  agir('enregistrer', async () => {
    appliquer(await api.remplacer<ModeleVu>('/modele', saisie()))
    confirmation.value = 'Votre modèle est enregistré : ADA travaillera avec lui pour vos demandes.'
  })

const tester = () =>
  agir('tester', async () => {
    test.value = await api.envoyer<ResultatTest>('/modele/tester', saisie())
  })

const retirer = () =>
  agir('retirer', async () => {
    appliquer(await api.supprimer<ModeleVu>('/modele'))
    confirmation.value = 'Votre modèle est retiré : ADA travaille de nouveau avec son modèle par défaut.'
  })
</script>

<template>
  <div class="fr-grid-row fr-grid-row--center">
    <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
      <h1 class="fr-h3">Mon modèle</h1>
      <p>
        Par défaut, ADA travaille avec son modèle<template v-if="vu?.parDefaut"> (« {{ vu.parDefaut }} »)</template>. Vous pouvez la faire
        travailler avec le vôtre : indiquez l’adresse de votre passerelle (compatible OpenAI), votre clé et le nom du modèle.
      </p>
      <p v-if="vu" class="fr-badge fr-badge--no-icon" :class="vu.configure ? 'fr-badge--success' : 'fr-badge--info'" role="status">
        {{ vu.configure ? `Votre modèle est utilisé : ${vu.modele}` : 'Modèle par défaut d’ADA' }}
      </p>

      <DsfrAlert v-if="erreurGenerale" type="error" small :description="erreurGenerale" class="fr-my-2w" />
      <DsfrAlert v-if="confirmation" type="success" small :description="confirmation" class="fr-my-2w" role="status" />

      <form novalidate class="fr-mt-3w" @submit.prevent="enregistrer">
        <DsfrInputGroup
          id="modele-adresse"
          v-model="adresse"
          label="Adresse de la passerelle"
          hint="Exemple : https://llm.mon-organisation.fr/v1"
          label-visible
          :error-message="erreurs.adresse"
          autocomplete="off"
        />
        <DsfrInputGroup
          id="modele-cle"
          v-model="cle"
          type="password"
          label="Clé d’API"
          :hint="vu?.cleFin ? `Une clé est enregistrée (${vu.cleFin}). Laissez vide pour la garder.` : 'Facultative pour une passerelle sans clé.'"
          label-visible
          :error-message="erreurs.cle"
          autocomplete="off"
        />
        <DsfrInputGroup
          id="modele-nom"
          v-model="modele"
          label="Nom du modèle"
          hint="Tel que la passerelle le désigne, par exemple glm-5."
          label-visible
          :error-message="erreurs.modele"
          autocomplete="off"
        />

        <p class="fr-text--sm">
          <span class="fr-icon-lock-line fr-icon--sm" aria-hidden="true" />
          Votre clé est chiffrée sur le serveur d’ADA et n’est jamais affichée ni transmise au projet : seule la passerelle que
          vous indiquez la reçoit.
        </p>

        <ul class="fr-btns-group fr-btns-group--inline-md">
          <li><DsfrButton type="submit" label="Enregistrer" :disabled="enCours !== null" /></li>
          <li>
            <DsfrButton type="button" secondary :label="enCours === 'tester' ? 'Essai en cours…' : 'Tester la connexion'" :disabled="enCours !== null" @click="tester" />
          </li>
          <li v-if="vu?.configure">
            <DsfrButton type="button" tertiary label="Revenir au modèle par défaut" :disabled="enCours !== null" @click="retirer" />
          </li>
        </ul>
      </form>

      <DsfrAlert
        v-if="test"
        :type="test.ok && test.appelsOutils ? 'success' : test.ok ? 'warning' : 'error'"
        small
        :description="test.message"
        class="fr-mt-2w"
        role="status"
      />
    </div>
  </div>
</template>
