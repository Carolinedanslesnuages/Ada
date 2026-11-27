import assert from 'node:assert/strict'
import { test } from 'node:test'
import { looseReplace, readWindow } from './edit-tools.mjs'

const file = ['function a() {', '  const x = 1', '  return x', '}', '', 'function b() {', '  return 2', '}'].join('\n')

test('modification exacte inchangée', () => {
  const r = looseReplace(file, '  return 2', '  return 3')
  assert.equal(r.ok, true)
  assert.match(r.text, /return 3/)
})
test('modification : l’indentation fausse du modèle est tolérée et corrigée', () => {
  const r = looseReplace(file, 'const x = 1\nreturn x', 'const x = 2\nreturn x * 2')
  assert.equal(r.ok, true)
  assert.match(r.text, /^ {2}const x = 2\n {2}return x \* 2\n\}/m)
})
test('modification : les fins de ligne Windows sont tolérées', () => {
  const r = looseReplace(file, '  const x = 1\r\n  return x', '  const x = 5\n  return x')
  assert.equal(r.ok, true)
  assert.match(r.text, /const x = 5/)
})
test('modification ambiguë : refus clair, rien n’est écrit', () => {
  const r = looseReplace(file, 'return', 'yield')
  assert.equal(r.ok, false)
  assert.match(r.error, /apparaît 2 fois/)
})
test('modification introuvable : le passage proche est montré', () => {
  const r = looseReplace(file, 'const x = 99\nreturn x', 'z')
  assert.equal(r.ok, false)
  assert.match(r.error, /passage proche/)
  assert.match(r.error, /const x = 1/)
})
test('lecture : line_start et line_end (1-based) valent offset et limit', () => {
  assert.deepEqual(readWindow({ line_start: 44, line_end: 60 }), { offset: 43, limit: 17 })
  assert.deepEqual(readWindow({ offset: 5, limit: 10 }), { offset: 5, limit: 10 })
  assert.deepEqual(readWindow({}), { offset: 0, limit: 2000 })
})
