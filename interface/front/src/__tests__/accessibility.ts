import axe from 'axe-core'

/**
 * Voice control (macOS Voice Control, Windows Voice Access, Dragon): the person
 * says what they read (“Click Send”). Every button and every link must therefore carry a
 * VISIBLE label, not only an icon with a hidden name.
 */
function withoutVisibleLabel(element: Element): string[] {
  const targets = [...element.querySelectorAll('button, a[href], [role="button"]')]
  return targets
    .filter((target) => {
      const copy = target.cloneNode(true) as Element
      copy.querySelectorAll('.fr-sr-only, [aria-hidden="true"]').forEach((cache) => cache.remove())
      return !(copy.textContent ?? '').trim()
    })
    .map((target) => `intitule-visible — Bouton ou lien sans intitulé visible, impossible à nommer à la voix : ${target.outerHTML.slice(0, 120)}`)
}

/** axe-core, WCAG 2.1 A/AA (basis of RGAA 4). Covers about a third of the criteria. */
export async function accessibilityViolations(element: Element): Promise<string[]> {
  const result = await axe.run(element, {
    // The content of a frame (the project preview) is the PO's application: audited by its own tests.
    iframes: false,
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } }, // cannot be measured under jsdom
  })
  // WCAG 2.5.3 (label in name): the spoken name must contain the visible label.
  const voice = await axe.run(element, { iframes: false, runOnly: { type: 'rule', values: ['label-content-name-mismatch'] } })
  return [...result.violations, ...voice.violations]
    .map((v) => `${v.id} — ${v.help} (${v.nodes.length}) : ${v.helpUrl}`)
    .concat(withoutVisibleLabel(element))
}
