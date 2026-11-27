import { describe, it, expect } from 'vitest'
import { composeAnswer, readChoices, ASSISTANT_MARKER, presentMessage, type ChoiceQuestion } from '../story'

const QUESTIONS: ChoiceQuestion[] = [
  { question: 'Retour le jour même ?', choice: ['Oui', 'Non'], several: false },
  { question: 'Quelles colonnes afficher ?', choice: ['Nom', 'Date', 'Emprunteur'], several: true },
]
/** Comment as the API writes it (agent.ts, questionsText). */
const comment = (questions: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(questions))
  const data = btoa(String.fromCharCode(...bytes))
  return `${ASSISTANT_MARKER}\n🤖 **Questions d’ADA**\n\nDeux règles à trancher.\n\n**Choix proposés** (à cocher dans ADA) :\n1. Retour…\n   - [ ] Oui\n\n<!-- ada:choix ${data} -->`
}

describe('ADA\'s choice questions', () => {
  it('reads the choices attached to the comment (accents included)', () => {
    expect(readChoices(comment(QUESTIONS))).toEqual(QUESTIONS)
    expect(readChoices('Sans choix')).toEqual([])
    expect(readChoices('<!-- ada:choix pas-du-base64! -->')).toEqual([])
  })

  it('displays in the feed neither the hidden data nor the repeated list of choices', () => {
    const message = presentMessage({ id: 1, author: 'robot', avatar: null, at: '', text: comment(QUESTIONS) })
    expect(message.text).toBe('🤖 **Questions d’ADA**\n\nDeux règles à trancher.')
  })

  it('composes a readable answer: ticked options and clarification, question by question', () => {
    const text = composeAnswer(QUESTIONS, [
      { ticked: ['Oui'], precision: '' },
      { ticked: ['Nom', 'Date'], precision: '  et la catégorie  ' },
    ])
    expect(text).toBe('1. Retour le jour même ?\n→ Oui\n\n2. Quelles colonnes afficher ?\n→ Nom ; Date\nPrécision : et la catégorie')
  })
})
