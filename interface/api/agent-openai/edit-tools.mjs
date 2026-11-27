// Outils de lecture et de modification plus tolérants, pour les modèles plus petits que Claude :
// ils se trompent souvent d'indentation ou de saut de ligne, et nomment autrement les paramètres de lecture.

const indentOf = (line) => line.length - line.trimStart().length
const sameLine = (a, b) => a.trim() === b.trim()

/** Fenêtre de lecture : accepte offset/limit (0-based) et les variantes line_start/line_end (1-based) que les modèles essaient. */
export function readWindow(input) {
  const first = Number(input.line_start ?? input.start_line ?? input.start ?? input.from ?? NaN)
  const last = Number(input.line_end ?? input.end_line ?? input.end ?? input.to ?? NaN)
  if (Number.isFinite(first) && first >= 1) {
    const length = Number.isFinite(last) && last >= first ? last - first + 1 : Number(input.limit) || 2000
    return { offset: first - 1, limit: length }
  }
  return { offset: Math.max(0, Number(input.offset) || 0), limit: Number(input.limit) || 2000 }
}

/** Remplacement exact d'abord ; sinon, en ignorant l'indentation et les fins de ligne, s'il n'y a qu'une correspondance. */
export function looseReplace(current, oldText, newText, replaceAll = false) {
  const exact = oldText ? current.split(oldText).length - 1 : 0
  if (exact === 1 || (exact > 1 && replaceAll)) {
    return { ok: true, text: replaceAll ? current.split(oldText).join(newText) : current.replace(oldText, () => newText) }
  }
  if (exact > 1) return { ok: false, error: `Erreur : old_string apparaît ${exact} fois ; précise-le ou utilise replace_all.` }
  const lines = current.split('\n')
  const wanted = oldText.replace(/\r/g, '').split('\n')
  while (wanted.length && !wanted[0].trim()) wanted.shift()
  while (wanted.length && !wanted[wanted.length - 1].trim()) wanted.pop()
  if (!wanted.length) return { ok: false, error: 'Erreur : old_string est vide.' }
  const found = []
  for (let start = 0; start + wanted.length <= lines.length; start++) {
    if (wanted.every((line, index) => sameLine(lines[start + index].replace(/\r/g, ''), line))) found.push(start)
  }
  if (found.length === 1) {
    const start = found[0]
    // Ré-indente le nouveau texte comme l'indentation réelle du fichier.
    const shift = indentOf(lines[start]) - indentOf(wanted[0])
    const replacement = newText.replace(/\r/g, '').split('\n').map((line) => (!line.trim() ? line : shift >= 0 ? ' '.repeat(shift) + line : line.slice(Math.min(-shift, indentOf(line)))))
    lines.splice(start, wanted.length, ...replacement)
    return { ok: true, text: lines.join('\n') }
  }
  if (found.length > 1) return { ok: false, error: `Erreur : old_string apparaît ${found.length} fois (en ignorant l’indentation) ; ajoute des lignes autour pour le rendre unique.` }
  return { ok: false, error: `Erreur : old_string introuvable dans le fichier.${nearest(lines, wanted)}` }
}

/** Les lignes du fichier les plus proches de la première ligne cherchée : de quoi corriger sans relire tout le fichier. */
function nearest(lines, wanted) {
  const keys = wanted.map((line) => line.trim()).filter((line) => line.length > 3)
  if (!keys.length) return ' Relis le fichier (Read) et recopie le texte exactement.'
  let at = -1
  for (const key of keys) {
    at = lines.findIndex((line) => line.includes(key))
    if (at >= 0) break
  }
  if (at < 0) return ' Aucune des lignes cherchées n’existe : relis le fichier (Read) avant de modifier.'
  const from = Math.max(0, at - 2)
  const excerpt = lines.slice(from, at + Math.max(wanted.length, 4)).map((line, index) => `${String(from + index + 1).padStart(6)}\t${line}`).join('\n')
  return ` Le passage proche, tel qu’il est dans le fichier :\n${excerpt}`
}
