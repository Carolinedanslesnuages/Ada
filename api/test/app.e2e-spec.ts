import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import session from 'express-session';
import { AppModule } from './../src/app.module.js';

process.env.GITHUB_PROPRIETAIRE = 'proprio';
process.env.GITHUB_CLIENT_ID = 'Iv-test';
process.env.GITHUB_CLIENT_SECRET = 'secret-test';
process.env.SESSION_SECRET = 'x'.repeat(32);

describe('Atelier PO (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(session({ secret: 'x'.repeat(32), resave: false, saveUninitialized: false }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('refuse la liste des projets sans connexion GitHub', () => {
    return request(app.getHttpServer()).get('/api/projets').expect(401);
  });

  it('refuse la création d’une story sans connexion GitHub', () => {
    return request(app.getHttpServer()).post('/api/projets/poc/stories').send({}).expect(401);
  });

  it('renvoie vers GitHub avec un état anti-falsification', async () => {
    const reponse = await request(app.getHttpServer()).get('/api/auth/github').expect(302);
    const url = new URL(reponse.headers.location);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('Iv-test');
    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/);
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5180/api/auth/github/callback');
  });

  it('refuse un retour GitHub dont l’état ne correspond pas', async () => {
    const reponse = await request(app.getHttpServer())
      .get('/api/auth/github/callback?code=abc&state=falsifie')
      .expect(302);
    expect(reponse.headers.location).toBe('http://localhost:5180/connexion?erreur=etat');
  });
});
