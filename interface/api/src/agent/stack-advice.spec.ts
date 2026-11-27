import { describe, expect, it } from 'vitest';
import { stackAdviceInstructions, readStackAdvice } from './stack-advice.js';

describe('Stack advice at creation (#68)', () => {
  it('reads the choice and its reason, even surrounded by text', () => {
    expect(readStackAdvice('Voici : {"template": "vue-node", "reason": "  Simple   et rapide. "} Bonne journée', ['vue-node'])).toEqual({
      template: 'vue-node',
      reason: 'Simple et rapide.',
    });
  });

  it('cuts an explanation that is too long at the end of a sentence, otherwise of a word', () => {
    const long = `${'Une application solide pour durer. '.repeat(10)}et encore des détails`;
    expect(readStackAdvice(JSON.stringify({ template: 'vue-node', reason: long }), ['vue-node'])!.reason).toMatch(/durer\.$/);
    const withoutPeriod = 'mot '.repeat(100);
    const truncated = readStackAdvice(JSON.stringify({ template: 'vue-node', reason: withoutPeriod }), ['vue-node'])!.reason;
    expect(truncated.length).toBeLessThanOrEqual(301);
    expect(truncated.endsWith('mot…')).toBe(true);
  });

  it('ignores an unreadable answer or a template outside the list', () => {
    expect(readStackAdvice('je ne sais pas', ['vue-node'])).toBeNull();
    expect(readStackAdvice('{"template": "unknown", "reason": "x"}', ['vue-node'])).toBeNull();
    expect(readStackAdvice('{"template": ', ['vue-node'])).toBeNull();
  });

  it('gives ADA the idea and the list of templates, and asks for a JSON answer without a tool', () => {
    const instructions = stackAdviceInstructions(
      'covoiturage entre agents',
      [{ id: 'vue-node', type: 'service', label: 'Vue 3 + Node.js', purpose: 'Petite application' }],
      [{ id: 'service', label: 'Application en ligne', description: 'Des écrans' }],
    );
    expect(instructions).toContain('covoiturage entre agents');
    expect(instructions).toContain('- vue-node : Application en ligne — Vue 3 + Node.js (Petite application)');
    expect(instructions).toContain('UNIQUEMENT par un objet JSON');
    expect(instructions).toContain('N’utilise aucun outil'.replace('’', "'"));
  });
});
