import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common';
import { readConfig } from '../config.js';
import type { GithubService } from '../github/github.service.js';
import { ACCESS_DURATION_MS, ProjectGuard } from './project.guard.js';

const config = readConfig({ GITHUB_OWNER: 'proprio', GITHUB_CLIENT_ID: 'Iv', GITHUB_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(32) });
const context = (repository: string, login = 'un-po') =>
  ({ switchToHttp: () => ({ getRequest: () => ({ params: { repository }, session: { token: 'jeton-du-po', user: { login } } }) }) }) as unknown as ExecutionContext;

describe('ProjectGuard (#37): the project\'s account, then the PO\'s GitHub rights', () => {
  const repos = { get: vi.fn() };
  let guard: ProjectGuard;

  beforeEach(() => {
    vi.useRealTimers();
    repos.get.mockReset();
    repos.get.mockResolvedValue({ data: {} });
    guard = new ProjectGuard(config, { client: () => ({ repos }) } as unknown as GithubService);
  });

  it('lets through the projects of the organization and of the PO\'s account that GitHub shows them', async () => {
    expect(await guard.canActivate(context('pret-de-materiel'))).toBe(true);
    expect(await guard.canActivate(context('un-po~mon-poc'))).toBe(true);
    expect(repos.get).toHaveBeenCalledWith({ owner: 'proprio', repo: 'pret-de-materiel' });
    expect(repos.get).toHaveBeenCalledWith({ owner: 'un-po', repo: 'mon-poc' });
  });

  it('refuses the project of another PO\'s account, and a malformed identifier, without asking GitHub', async () => {
    await expect(guard.canActivate(context('autre-po~son-poc'))).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context('../etc'))).rejects.toThrow(BadRequestException);
    expect(repos.get).not.toHaveBeenCalled();
  });

  it('refuses a repository of the organization that GitHub does not show to this PO (private repository without access)', async () => {
    repos.get.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(guard.canActivate(context('depot-prive'))).rejects.toThrow(NotFoundException);
  });

  it('does not keep a refusal: access granted afterwards goes through', async () => {
    repos.get.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }));
    await expect(guard.canActivate(context('depot-prive'))).rejects.toThrow(ForbiddenException);
    expect(await guard.canActivate(context('depot-prive'))).toBe(true);
  });

  it('does not ask GitHub again at every polling request (every 4 s), but checks again after one minute', async () => {
    vi.useFakeTimers();
    await guard.canActivate(context('poc'));
    await guard.canActivate(context('poc'));
    expect(repos.get).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ACCESS_DURATION_MS + 1);
    await guard.canActivate(context('poc'));
    expect(repos.get).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('access granted to one PO does not apply to another', async () => {
    await guard.canActivate(context('poc', 'un-po'));
    repos.get.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(guard.canActivate(context('poc', 'autre-po'))).rejects.toThrow(NotFoundException);
  });
});
