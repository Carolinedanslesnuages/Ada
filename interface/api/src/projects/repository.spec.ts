import { describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { projectIdentifier, parseIdentifier, technicalName, checkAccess } from './repository.js';

describe('identifier of a project (#37)', () => {
  it('keeps the bare name for ADA\'s organization: existing addresses do not change', () => {
    expect(projectIdentifier('Proprio', 'Pret-De-Materiel', 'proprio')).toBe('pret-de-materiel');
    expect(parseIdentifier('pret-de-materiel', 'proprio')).toEqual({ owner: 'proprio', repo: 'pret-de-materiel' });
  });

  it('prefixes with the account a repository outside the organization', () => {
    expect(projectIdentifier('Un-PO', 'Mon.POC', 'proprio')).toBe('un-po~mon.poc');
    expect(parseIdentifier('un-po~mon.poc', 'proprio')).toEqual({ owner: 'un-po', repo: 'mon.poc' });
  });

  it('refuses a malformed identifier (paths, extra separators, invalid login)', () => {
    for (const id of ['../etc', 'a b', 'a~b~c', '~poc', 'po~', '-po~poc', 'p--o~poc']) {
      expect(() => parseIdentifier(id, 'proprio'), id).toThrow(BadRequestException);
    }
  });

  it('opens only the projects of the organization and of the signed-in PO\'s account', () => {
    expect(() => checkAccess({ owner: 'proprio', repo: 'poc' }, 'un-po', 'proprio')).not.toThrow();
    expect(() => checkAccess({ owner: 'Un-PO', repo: 'poc' }, 'un-po', 'proprio')).not.toThrow();
    expect(() => checkAccess({ owner: 'autre-po', repo: 'poc' }, 'un-po', 'proprio')).toThrow(ForbiddenException);
  });

  it('gives a name accepted by docker compose', () => {
    expect(technicalName('apercu-un-po~mon.poc')).toBe('apercu-un-po-mon-poc');
  });
});
