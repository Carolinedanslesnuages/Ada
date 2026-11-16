import axe from 'axe-core'

/** axe-core, WCAG 2.1 A/AA (base du RGAA 4). Couvre environ un tiers des critères. */
export async function violationsAccessibilite(element: Element): Promise<string[]> {
  const resultat = await axe.run(element, {
    // Le contenu d'un cadre (l'aperçu du projet) est l'application du PO : auditée par ses propres tests.
    iframes: false,
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } }, // non mesurable sous jsdom
  })
  return resultat.violations.map((v) => `${v.id} — ${v.help} (${v.nodes.length}) : ${v.helpUrl}`)
}
