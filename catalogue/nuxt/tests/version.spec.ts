import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lireVersion, VERSION_DEV } from '../server/utils/version'

describe('Version du site (/__version__)', () => {
  it('sans fichier de version (poste, tests, aperçu) : repli « dev », jamais une erreur', () => {
    expect(lireVersion('/chemin/absent/version.json')).toEqual(VERSION_DEV)
  })

  it('sert le fichier de version de l’image tel quel', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'version-')), 'version.json')
    writeFileSync(fichier, JSON.stringify({ version: '1.2.0', commit: 'abc' }))
    expect(lireVersion(fichier)).toEqual({ version: '1.2.0', commit: 'abc' })
  })
})
