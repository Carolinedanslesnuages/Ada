import { describe, it, expect } from 'vitest';
import { readSummary, canPublish, versionFromTitle } from './versions.js';

const BODY = `:robot: I have created a release *beep* *boop*
---


## [0.2.0](https://github.com/p/poc/compare/v0.1.0...v0.2.0) (2026-11-16)


### Features

* AJOUTER LE NOM DU SERVICE ([#5](https://github.com/p/poc/issues/5)) ([2657aec](https://github.com/p/poc/commit/2657aec)), closes [#2](https://github.com/p/poc/issues/2)
* Page d'accueil ([#3](https://github.com/p/poc/issues/3)) ([c4a7c4c](https://github.com/p/poc/commit/c4a7c4c)), closes [#1](https://github.com/p/poc/issues/1)


### Bug Fixes

* **accueil:** la date s’affiche en français ([#7](https://github.com/p/poc/issues/7)) ([abc1234](https://github.com/p/poc/commit/abc1234))

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please).`;

describe('Summary of a version', () => {
  it('reads the proposed version number', () => {
    expect(versionFromTitle('chore(main): release 0.2.0')).toBe('0.2.0');
    expect(versionFromTitle('autre chose')).toBeNull();
  });

  it('presents the features and the fixes in plain words, with the delivered request', () => {
    expect(readSummary('chore(main): release 0.2.0', BODY)).toEqual({
      version: '0.2.0',
      features: [
        { text: 'AJOUTER LE NOM DU SERVICE', workRequest: 2 },
        { text: 'Page d\'accueil', workRequest: 1 },
      ],
      fixes: [{ text: 'accueil: la date s’affiche en français', workRequest: null }],
      others: [],
    });
  });
});

describe('Can it be published?', () => {
  it('yes if the PR only touches the version files', () => {
    expect(canPublish(['.release-please-manifest.json', 'CHANGELOG.md', 'version.txt'])).toEqual({ publishable: true, reason: null });
  });

  it('no if it touches code: a developer must look', () => {
    const result = canPublish(['CHANGELOG.md', 'front/src/App.vue']);
    expect(result.publishable).toBe(false);
    expect(result.reason).toContain('front/src/App.vue');
  });
});
