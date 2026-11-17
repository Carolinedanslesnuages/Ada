import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ADA_PAR_DEFAUT } from '../ada/ada-config.js';
import { lireConfig } from '../config.js';
import type { ApercuService } from '../apercu/apercu.service.js';
import type { GithubService } from '../github/github.service.js';
import { ProjetsService } from './projets.service.js';

const racine = mkdtempSync(join(tmpdir(), 'ada-test-projets-'));
const dossierCatalogue = join(racine, 'catalogue');

const variables = {
  GITHUB_PROPRIETAIRE: 'proprio',
  GITHUB_CLIENT_ID: 'Iv',
  GITHUB_CLIENT_SECRET: 's',
  SESSION_SECRET: 'x'.repeat(32),
};
const config = lireConfig({ ...variables, CATALOGUE: dossierCatalogue });

const depot = (name: string, topics: string[], updated_at = '2026-11-16T10:00:00Z', owner = 'proprio') => ({
  name,
  owner: { login: owner },
  default_branch: 'main',
  topics,
  updated_at,
  description: null,
  private: true,
  html_url: `https://github.com/${owner}/${name}`,
});

const git = (dossier: string, ...args: string[]) =>
  execFileSync('git', [...(dossier.endsWith('.git') ? ['--git-dir', dossier] : ['-C', dossier]), ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

const ecrire = (fichier: string, contenu: string) => {
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(fichier, contenu);
};

/** Catalogue de test : deux modèles livrés, dans un dépôt git (comme celui d'ADA). */
const preparerCatalogue = () => {
  rmSync(racine, { recursive: true, force: true });
  ecrire(join(dossierCatalogue, '.gitignore'), 'node_modules/\n');
  ecrire(join(dossierCatalogue, 'vue-nest-dsfr', 'ada.json'), JSON.stringify({ ...ADA_PAR_DEFAUT, personnaliser: ['PROJET.md'] }));
  ecrire(join(dossierCatalogue, 'vue-nest-dsfr', 'PROJET.md'), '# __NOM_PROJET__\n__OBJECTIF__');
  ecrire(join(dossierCatalogue, 'vue-nest-dsfr', 'front', 'src', 'App.vue'), 'sans marqueur __NOM_PROJET__');
  ecrire(join(dossierCatalogue, 'vue-nest-dsfr', 'node_modules', 'lourd.js'), 'à ne pas copier');
  ecrire(
    join(dossierCatalogue, 'maquette', 'ada.json'),
    JSON.stringify({ type: 'maquette', personnaliser: ['index.html'], controlesRequis: ['Maquette (tests)'], controles: ['npm test'], apercu: { npm: ['.'], principal: 'npx vite' } }),
  );
  ecrire(join(dossierCatalogue, 'maquette', 'index.html'), '<title>__NOM_PROJET__</title>');
  ecrire(
    join(dossierCatalogue, 'vue-node', 'ada.json'),
    JSON.stringify({ ...ADA_PAR_DEFAUT, personnaliser: ['charts/app/Chart.yaml'], deploiement: { chart: 'charts/app' } }),
  );
  ecrire(join(dossierCatalogue, 'vue-node', 'Dockerfile'), 'FROM node:24');
  ecrire(join(dossierCatalogue, 'vue-node', 'charts', 'app', 'Chart.yaml'), 'name: __SLUG__');
  ecrire(join(dossierCatalogue, 'vue-node', 'charts', 'app', 'templates', 'deployment.yaml'), 'kind: Deployment');
  git(dossierCatalogue, 'init', '--quiet');
};

/** Dépôt « GitHub » du projet : un dépôt nu local, vide comme après la création. */
const depotDistant = () => {
  const nu = join(racine, 'distant.git');
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', nu]);
  return nu;
};

const fichiersPousses = (nu: string) => git(nu, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n');
const lirePousse = (nu: string, fichier: string) => git(nu, 'show', `main:${fichier}`);

describe('ProjetsService', () => {
  const gh = {
    paginate: vi.fn(),
    request: vi.fn(),
    repos: {
      listForAuthenticatedUser: vi.fn(),
      listForOrg: vi.fn(),
      get: vi.fn(),
      createForAuthenticatedUser: vi.fn(),
      createInOrg: vi.fn(),
      getContent: vi.fn(),
      replaceAllTopics: vi.fn(),
      update: vi.fn(),
    },
    issues: { createLabel: vi.fn(), create: vi.fn(), createComment: vi.fn() },
    pulls: { list: vi.fn() },
  };
  const github = { client: vi.fn(() => gh) } as unknown as GithubService;
  const apercu = { environnementGit: () => ({ ...process.env }) } as unknown as ApercuService;
  let service: ProjetsService;
  let distant: string;

  const projetValide = { nom: "L'annuaire", objectif: 'Trouver un collègue et son bureau', modele: 'vue-nest-dsfr' };

  const preparerCreation = () => {
    gh.repos.get.mockRejectedValue({ status: 404 });
    gh.repos.createForAuthenticatedUser.mockResolvedValue({ data: depot('l-annuaire', []) });
    gh.repos.createInOrg.mockResolvedValue({ data: depot('l-annuaire', []) });
    gh.request.mockResolvedValue({ data: [] });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    preparerCatalogue();
    distant = depotDistant();
    service = new ProjetsService(config, github, apercu);
    service.urlDepot = () => distant;
  });

  afterEach(() => rmSync(racine, { recursive: true, force: true }));

  it('liste les projets ADA et ceux créés avant le renommage (topic atelier-po), sans passer par la recherche', async () => {
    gh.paginate.mockResolvedValue([
      depot('ancien', ['atelier-po'], '2026-01-01T00:00:00Z'),
      depot('autre', ['perso']),
      depot('en-creation', ['ada-creation']),
      depot('recent', ['ada'], '2026-11-16T00:00:00Z'),
    ]);
    const projets = await service.lister('jeton', 'Proprio');
    expect(gh.paginate).toHaveBeenCalledWith(gh.repos.listForAuthenticatedUser, expect.objectContaining({ affiliation: 'owner' }));
    expect(projets.map((p) => p.nom)).toEqual(['recent', 'ancien']);
  });

  it('liste les dépôts de l’organisation quand le propriétaire n’est pas le PO', async () => {
    gh.paginate.mockResolvedValue([]);
    await service.lister('jeton', 'un-po');
    expect(gh.paginate).toHaveBeenCalledWith(gh.repos.listForOrg, expect.objectContaining({ org: 'proprio' }));
  });

  it('liste aussi les projets du compte personnel du PO, avec un identifiant « compte~nom » (#37)', async () => {
    gh.paginate.mockImplementation(async (methode: unknown) =>
      methode === gh.repos.listForOrg ? [depot('commun', ['ada'])] : [depot('Perso', ['ada'], '2026-11-17T00:00:00Z', 'Un-PO')],
    );
    const projets = await service.lister('jeton', 'un-po');
    expect(projets).toEqual([
      expect.objectContaining({ id: 'un-po~perso', nom: 'Perso', proprietaire: 'Un-PO', compte: 'personnel' }),
      expect.objectContaining({ id: 'commun', nom: 'commun', proprietaire: 'proprio', compte: 'organisation' }),
    ]);
  });

  it('une reprise est visible dès son lancement (PR à valider), puis devient un projet ADA une fois fusionnée', async () => {
    gh.paginate.mockResolvedValue([depot('repris', ['vue', 'ada-reprise']), depot('en-attente', ['ada-reprise'])]);
    gh.repos.getContent.mockImplementation(async ({ repo }: { repo: string }) => {
      if (repo === 'repris') return { data: { content: '' } };
      throw Object.assign(new Error('absent'), { status: 404 });
    });
    gh.repos.replaceAllTopics.mockResolvedValue({});
    gh.pulls.list.mockResolvedValue({ data: [{ html_url: 'https://github.com/proprio/en-attente/pull/2' }] });
    const projets = await service.lister('jeton', 'proprio');
    expect(projets).toEqual([
      expect.objectContaining({ id: 'repris', reprise: null, repris: true }),
      expect.objectContaining({ id: 'en-attente', reprise: { pullRequest: 'https://github.com/proprio/en-attente/pull/2' } }),
    ]);
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith({ owner: 'proprio', repo: 'repris', names: ['vue', 'ada-reprise', 'ada'] });
  });

  it('refuse un projet invalide sans rien créer', async () => {
    await expect(service.creer('jeton', 'po', { nom: 'x', objectif: '', modele: '' })).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('ne propose que les modèles livrés dans le catalogue d’ADA, sans dépôt modèle GitHub', () => {
    const { familles, types, modeles } = service.modeles();
    expect(types.map((t) => t.id)).toEqual(expect.arrayContaining(['service', 'formulaire', 'extension', 'api', 'maquette']));
    for (const type of types) expect(familles.map((f) => f.id)).toContain(type.famille);
    for (const modele of modeles) expect(types.map((t) => t.id)).toContain(modele.type);
    for (const type of types) expect(modeles.some((m) => m.type === type.id)).toBe(true);
    expect(modeles.filter((m) => m.disponible).map((m) => m.id)).toEqual(['vue-nest-dsfr', 'vue-node', 'maquette']);
    expect(modeles.filter((m) => m.deployable).map((m) => m.id)).toEqual(['vue-node']);
    expect(modeles.find((m) => m.id === 'formulaire')).toMatchObject({ type: 'formulaire', disponible: false });
    expect(gh.repos.get).not.toHaveBeenCalled();
  });

  it('trouve par défaut le catalogue à la racine du dépôt d’ADA', () => {
    const parDefaut = new ProjetsService(lireConfig(variables), github, apercu);
    expect(parDefaut.dossierCatalogue).toMatch(/[/\\]catalogue$/);
    expect(parDefaut.modeles().modeles.find((m) => m.id === 'vue-nest-dsfr')!.disponible).toBe(true);
  });

  it('refuse un type de projet dont le modèle n’est pas encore livré', async () => {
    preparerCreation();
    await expect(service.creer('jeton', 'po', { ...projetValide, modele: 'django' })).rejects.toBeInstanceOf(BadRequestException);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('refuse un nom déjà pris', async () => {
    gh.repos.get.mockResolvedValue({ data: depot('l-annuaire', []) });
    await expect(service.creer('jeton', 'po', projetValide)).rejects.toBeInstanceOf(ConflictException);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('crée un dépôt privé vide, le règle, puis pousse le modèle personnalisé en un seul commit', async () => {
    preparerCreation();
    const resultat = await service.creer('jeton', 'proprio', projetValide);

    expect(gh.repos.createForAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'l-annuaire', private: true, auto_init: false }),
    );
    expect(fichiersPousses(distant)).toEqual(['PROJET.md', 'ada.json', 'front/src/App.vue']);
    expect(lirePousse(distant, 'PROJET.md')).toBe('# L’annuaire\nTrouver un collègue et son bureau.');
    expect(lirePousse(distant, 'front/src/App.vue')).toBe('sans marqueur __NOM_PROJET__');
    expect(git(distant, 'log', '--format=%an|%s', 'main').trim()).toBe('proprio|chore: création du projet L’annuaire');

    expect(gh.repos.update).toHaveBeenCalledWith(
      expect.objectContaining({ repo: 'l-annuaire', allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, delete_branch_on_merge: true }),
    );
    const topics = gh.repos.replaceAllTopics.mock.calls.map((appel) => (appel[0] as { names: string[] }).names);
    expect(topics).toEqual([['ada-creation'], ['ada']]);
    const labels = gh.issues.createLabel.mock.calls.map((appel) => (appel[0] as { name: string }).name);
    expect(labels).toEqual(expect.arrayContaining(['user-story', 'bug', 'story:en-cours', 'story:besoin-dev']));
    const routes = gh.request.mock.calls.map(([route]) => String(route));
    expect(routes.indexOf('PUT /repos/{owner}/{repo}/actions/permissions/workflow')).toBeLessThan(routes.indexOf('POST /repos/{owner}/{repo}/rulesets'));
    expect(resultat.reglages.versionsAutomatiques.etat).toBe('fait');
    expect(resultat.reglages.protectionMain.etat).toBe('fait');
  });

  it('l’idée racontée à la création devient la première demande libre, lancée pour l’assistant (#68)', async () => {
    preparerCreation();
    gh.issues.create.mockResolvedValue({ data: { number: 1 } });
    const idee = 'partager les trajets entre agents, le matin surtout';
    const resultat = await service.creer('jeton', 'proprio', { nom: "L'annuaire", modele: 'vue-nest-dsfr', idee });
    expect(resultat.idee).toBe(1);
    expect(gh.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'proprio', repo: 'l-annuaire', title: `Demande libre : ${idee}`, labels: ['mode-libre', 'story:en-cours'] }),
    );
    expect(gh.issues.create.mock.calls[0]![0].body).toContain(idee);
    expect(gh.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 1, body: expect.stringContaining('Lancée depuis ADA') }));
    // L'objectif (description du dépôt, PROJET.md) vient de l'idée.
    expect(lirePousse(distant, 'PROJET.md')).toContain('partager les trajets entre agents, le matin surtout.');
  });

  it('sans idée, aucune demande n’est créée ; un échec de l’idée ne défait pas la création', async () => {
    preparerCreation();
    expect((await service.creer('jeton', 'proprio', projetValide)).idee).toBeNull();
    expect(gh.issues.create).not.toHaveBeenCalled();
    rmSync(distant, { recursive: true, force: true });
    distant = depotDistant();
    gh.issues.create.mockRejectedValue({ status: 500 });
    await expect(service.creer('jeton', 'proprio', { ...projetValide, nom: 'Autre projet', idee: 'une idée assez longue' })).resolves.toMatchObject({ idee: null });
  });

  it('crée le dépôt dans l’organisation quand le PO n’en est pas le propriétaire', async () => {
    preparerCreation();
    await service.creer('jeton', 'un-po', projetValide);
    expect(gh.repos.createInOrg).toHaveBeenCalledWith(expect.objectContaining({ org: 'proprio', name: 'l-annuaire' }));
  });

  it('explique au PO que l’App ne peut pas créer de dépôt (403 de GitHub)', async () => {
    preparerCreation();
    gh.repos.createForAuthenticatedUser.mockRejectedValue({ status: 403, request: { method: 'POST', url: 'x' } });
    await expect(service.creer('jeton', 'proprio', projetValide)).rejects.toThrow(/Repository access/);
  });

  it('tolère un label déjà présent dans le dépôt (« bug » existe par défaut)', async () => {
    preparerCreation();
    gh.issues.createLabel.mockImplementation(async ({ name }: { name: string }) => {
      if (name === 'bug') throw { status: 422 };
    });
    await expect(service.creer('jeton', 'proprio', projetValide)).resolves.toBeDefined();
  });

  it('reprend une création interrompue après le push sans rien repousser ni doubler la protection', async () => {
    preparerCreation();
    await service.creer('jeton', 'proprio', projetValide);
    vi.clearAllMocks();
    gh.repos.get.mockResolvedValue({ data: depot('l-annuaire', ['ada-creation']) });
    gh.request.mockImplementation(async (route: string) => (route.startsWith('GET') ? { data: [{ name: 'main protégée' }] } : {}));

    const resultat = await service.creer('jeton', 'proprio', projetValide);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
    expect(git(distant, 'rev-list', '--count', 'main').trim()).toBe('1');
    expect(gh.request.mock.calls.some(([route]) => route === 'POST /repos/{owner}/{repo}/rulesets')).toBe(false);
    expect(gh.repos.replaceAllTopics).toHaveBeenCalledWith(expect.objectContaining({ names: ['ada'] }));
    expect(resultat.reglages.protectionMain.etat).toBe('fait');
  });

  it('reprend une création lancée avec l’ancienne méthode (dépôt généré depuis un dépôt modèle)', async () => {
    preparerCreation();
    const ancien = join(racine, 'ancien');
    git(racine, 'clone', '--quiet', distant, ancien);
    ecrire(join(ancien, 'PROJET.md'), '# __NOM_PROJET__');
    ecrire(join(ancien, 'obsolete.txt'), 'fichier de l’ancien modèle');
    git(ancien, 'add', '-A');
    git(ancien, 'commit', '--quiet', '-m', 'Initial commit');
    git(ancien, 'push', '--quiet', 'origin', 'HEAD:main');
    gh.repos.get.mockResolvedValue({ data: { ...depot('l-annuaire', []), template_repository: { name: 'modele-vue-nest-dsfr' } } });

    await service.creer('jeton', 'proprio', projetValide);
    expect(fichiersPousses(distant)).toEqual(['PROJET.md', 'ada.json', 'front/src/App.vue']);
    expect(git(distant, 'rev-list', '--count', 'main').trim()).toBe('2');
  });

  it('refuse toujours un dépôt existant qui n’est pas une création d’ADA en cours', async () => {
    gh.repos.get.mockResolvedValue({ data: { ...depot('l-annuaire', ['ada']), template_repository: { name: 'modele-vue-nest-dsfr' } } });
    await expect(service.creer('jeton', 'proprio', projetValide)).rejects.toBeInstanceOf(ConflictException);
    gh.repos.get.mockResolvedValue({ data: { ...depot('l-annuaire', []), template_repository: null } });
    await expect(service.creer('jeton', 'proprio', projetValide)).rejects.toBeInstanceOf(ConflictException);
    expect(gh.repos.createForAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('crée le projet même si GitHub refuse le réglage de fusion', async () => {
    preparerCreation();
    gh.repos.update.mockRejectedValueOnce({ status: 403 });
    await expect(service.creer('jeton', 'proprio', projetValide)).resolves.toBeDefined();
  });

  it('personnalise et protège main selon l’ada.json du modèle', async () => {
    preparerCreation();
    await service.creer('jeton', 'proprio', { ...projetValide, modele: 'maquette' });
    expect(lirePousse(distant, 'index.html')).toBe('<title>L’annuaire</title>');
    const regles = gh.request.mock.calls.find(([route]) => route === 'POST /repos/{owner}/{repo}/rulesets')![1] as { rules: { type: string; parameters?: { required_status_checks?: { context: string }[] } }[] };
    expect(regles.rules.find((r) => r.type === 'required_status_checks')!.parameters!.required_status_checks).toEqual([{ context: 'Maquette (tests)' }]);
  });

  it('signale au PO les réglages que GitHub refuse (compte gratuit, organisation)', async () => {
    preparerCreation();
    gh.request.mockRejectedValue({ status: 403 });
    const resultat = await service.creer('jeton', 'proprio', projetValide);
    expect(resultat.reglages).toEqual({
      versionsAutomatiques: { etat: 'a-faire', lien: 'https://github.com/proprio/l-annuaire/settings/actions' },
      protectionMain: { etat: 'a-faire', lien: 'https://github.com/proprio/l-annuaire/settings/rules' },
    });
  });

  it('ne laisse aucune copie de travail derrière lui', async () => {
    preparerCreation();
    const avant = readFileSync(join(dossierCatalogue, 'vue-nest-dsfr', 'PROJET.md'), 'utf8');
    await service.creer('jeton', 'proprio', projetValide);
    expect(readFileSync(join(dossierCatalogue, 'vue-nest-dsfr', 'PROJET.md'), 'utf8')).toBe(avant);
  });

  it('n’ajoute le chart de déploiement que si le PO prévoit de déployer le projet', async () => {
    preparerCreation();
    await service.creer('jeton', 'proprio', { ...projetValide, modele: 'vue-node' });
    expect(fichiersPousses(distant)).toEqual(['Dockerfile', 'ada.json']);
  });

  it('projet déployé : chart Helm ajouté et personnalisé', async () => {
    preparerCreation();
    await service.creer('jeton', 'proprio', { ...projetValide, modele: 'vue-node', deploye: true });
    expect(fichiersPousses(distant)).toEqual(['Dockerfile', 'ada.json', 'charts/app/Chart.yaml', 'charts/app/templates/deployment.yaml']);
    expect(lirePousse(distant, 'charts/app/Chart.yaml')).toBe('name: l-annuaire');
  });
});
