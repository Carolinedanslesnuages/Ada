import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { SignedInGuard, RENEWAL_MARGIN_MS } from './signed-in.guard.js';
import type { GithubOAuthService } from './github-oauth.service.js';

const context = (session: Record<string, unknown> | undefined) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ session }) }) }) as unknown as ExecutionContext;

const session = (extra: Record<string, unknown>) => ({
  token: 'ancien',
  destroy: vi.fn((end: () => void) => end()),
  ...extra,
});

describe('Sign-in guard and token renewal', () => {
  const oauth = { refresh: vi.fn() };
  let guard: SignedInGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new SignedInGuard(oauth as unknown as GithubOAuthService);
  });

  it('refuses without a GitHub session', async () => {
    await expect(guard.canActivate(context(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets through a token that is still valid, without renewing it', async () => {
    expect(await guard.canActivate(context(session({ tokenExpiresAt: Date.now() + RENEWAL_MARGIN_MS + 3_600_000 })))).toBe(true);
    expect(oauth.refresh).not.toHaveBeenCalled();
  });

  it('silently renews a token that expires soon', async () => {
    oauth.refresh.mockResolvedValue({ access_token: 'nouveau', refresh_token: 'renouv-2', expires_in: 28_800 });
    const sess = session({ tokenExpiresAt: Date.now() + 60_000, refreshToken: 'renouv-1' });
    expect(await guard.canActivate(context(sess))).toBe(true);
    expect(oauth.refresh).toHaveBeenCalledWith('renouv-1');
    expect(sess.token).toBe('nouveau');
    expect((sess as Record<string, unknown>).refreshToken).toBe('renouv-2');
    expect((sess as Record<string, unknown>).tokenExpiresAt as number).toBeGreaterThan(Date.now() + 28_000_000);
  });

  it('closes the session and asks to sign in again if the renewal fails', async () => {
    oauth.refresh.mockRejectedValue(new UnauthorizedException('bad_refresh_token'));
    const sess = session({ tokenExpiresAt: Date.now() - 1000, refreshToken: 'perime' });
    await expect(guard.canActivate(context(sess))).rejects.toThrow(/reconnectez-vous/);
    expect(sess.destroy).toHaveBeenCalled();
  });

  it('closes an expired session without a renewal token', async () => {
    const sess = session({ tokenExpiresAt: Date.now() - 1000 });
    await expect(guard.canActivate(context(sess))).rejects.toThrow(/reconnectez-vous/);
    expect(oauth.refresh).not.toHaveBeenCalled();
  });

  it('renews early enough for a task launched now to keep a valid token for at least 2 hours', async () => {
    oauth.refresh.mockResolvedValue({ access_token: 'nouveau', refresh_token: 'renouv-2', expires_in: 28_800 });
    const sess = session({ tokenExpiresAt: Date.now() + RENEWAL_MARGIN_MS - 60_000, refreshToken: 'renouv-1' });
    await guard.canActivate(context(sess));
    expect(oauth.refresh).toHaveBeenCalledTimes(1);
  });

  it('simultaneous requests share a single renewal (the old renewal token is used only once)', async () => {
    let finish: (value: { access_token: string; refresh_token: string; expires_in: number }) => void = () => undefined;
    oauth.refresh.mockImplementation(() => new Promise((ok) => (finish = ok)));
    const nearby = () => session({ tokenExpiresAt: Date.now() + 1000, refreshToken: 'renouv-1' });
    const [a, b, c] = [nearby(), nearby(), nearby()];
    const all = Promise.all([guard.canActivate(context(a)), guard.canActivate(context(b)), guard.canActivate(context(c))]);
    finish({ access_token: 'nouveau', refresh_token: 'renouv-2', expires_in: 28_800 });
    expect(await all).toEqual([true, true, true]);
    expect(oauth.refresh).toHaveBeenCalledTimes(1);
    expect([a.token, b.token, c.token]).toEqual(['nouveau', 'nouveau', 'nouveau']);
  });
});
