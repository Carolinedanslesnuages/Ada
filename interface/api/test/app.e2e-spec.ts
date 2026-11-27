import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { readConfig } from '../src/config.js';
import { configureApp } from '../src/configure-app.js';

process.env.GITHUB_OWNER = 'proprio';
process.env.GITHUB_CLIENT_ID = 'Iv-test';
process.env.GITHUB_CLIENT_SECRET = 'secret-test';
process.env.SESSION_SECRET = 'x'.repeat(32);
process.env.SESSIONS_DIR = mkdtempSync(join(tmpdir(), 'sessions-e2e-'));

describe('ADA (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app, readConfig());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('refuses the list of projects without a GitHub sign-in', () => {
    return request(app.getHttpServer()).get('/api/projects').expect(401);
  });

  it('refuses to launch a story without a GitHub sign-in', () => {
    return request(app.getHttpServer()).post('/api/projects/poc/stories/1/launch').expect(401);
  });

  it('no longer offers story creation in the workshop (they are written in GitHub)', () => {
    return request(app.getHttpServer()).post('/api/projects/poc/stories').send({}).expect(404);
  });

  it('redirects to GitHub with an anti-forgery state', async () => {
    const response = await request(app.getHttpServer()).get('/api/auth/github').expect(302);
    const url = new URL(response.headers.location);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('Iv-test');
    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/);
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5180/api/auth/github/callback');
  });

  it('refuses a GitHub callback whose state does not match', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/github/callback?code=abc&state=falsifie')
      .expect(302);
    expect(response.headers.location).toBe('http://localhost:5180/sign-in?error=state');
  });

  it('goes back to the sign-in screen, without raw JSON, if GitHub refuses the exchange', async () => {
    const agent = request.agent(app.getHttpServer());
    const offset = await agent.get('/api/auth/github').expect(302);
    const state = new URL(offset.headers.location).searchParams.get('state');
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'incorrect_client_credentials' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    try {
      const returned = await agent.get(`/api/auth/github/callback?code=abc&state=${state}`).expect(302);
      expect(returned.headers.location).toBe('http://localhost:5180/sign-in?error=github');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it.each(['/__version__', '/api/__version__'])('serves the version on %s (“dev” fallback)', async (filePath) => {
    const response = await request(app.getHttpServer()).get(filePath).expect(200);
    expect(response.body.version).toBe('dev');
  });


});
