import { describe, it, expect } from 'vitest';
import { GithubService } from './github.service.js';

describe('GitHub client', () => {
  it('automatically retries transient errors (“retry” plugin)', () => {
    const client = new GithubService().client('token') as unknown as { retry?: { retryRequest?: unknown } };
    expect(typeof client.retry?.retryRequest).toBe('function');
  });
});
