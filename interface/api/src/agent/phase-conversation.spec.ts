import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readBreakdown } from '../stories/story.js';
import type { AgentService } from './agent.service.js';
import { trialDetail, type FakePreview, TOKEN, prepareBench, result } from './agent.bench.js';

describe('AgentService — conversation', () => {
  let stories: ReturnType<typeof prepareBench>['stories'];
  let preview: FakePreview;
  let gh: ReturnType<typeof prepareBench>['gh'];
  let service: AgentService;
  let launch: ReturnType<typeof prepareBench>['launch'];
  let output: string[];
  let status: string;
  let commits = '1';
  const detail = () => trialDetail(status);

  beforeEach(() => {
    status = 'in-progress';
    commits = '1';
    output = [];
    ({ stories, preview, gh, service, launch } = prepareBench({ output: () => output, status: () => status, changeStatus: (created) => (status = created), commits: () => commits }));
  });

  describe('conversation (“real prompt”)', () => {
    const conversation = () => ({
      ...detail(),
      type: 'conversation',
      title: 'Conversation : mets le titre en bleu',
      status,
      content: null,
      freeContent: 'Mets le titre en bleu',
      messages: [{ id: 2, author: 'po', text: '▶️ Lancée depuis ADA par po1 (conversation).', at: '' }],
    });
    beforeEach(() => {
      stories.detail = vi.fn(async () => conversation());
      stories.closeAsNotPlanned = vi.fn(async () => undefined);
      preview.run = vi.fn(async (_c: string, args: string[]) => ({
        stdout: args.includes('rev-list') ? `${commits}\n` : args.includes('branch') ? '  conversation/1-mets-le-titre-en-bleu\n' : args.includes('rev-parse') ? 'main\n' : '',
      }));
    });

    it('acts right away on its branch, pushes the commits, restarts the preview and replies', async () => {
      output = [result('{"response":"C’est fait : le titre est bleu."}')];
      await service.converse(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      const args = launch.mock.calls[0]![0];
      expect(args.slice(args.indexOf('--allowedTools') + 1)).toContain('Edit(./**)');
      expect(args[1]).toContain('PHASE : CONVERSATION');
      expect(args[1]).toContain('Premier message du PO :\nMets le titre en bleu');
      const calls = preview.run.mock.calls.map((call) => (call[1] as string[]).join(' '));
      expect(calls.some((call) => call.startsWith('-C') && call.includes('checkout --quiet conversation/1-mets-le-titre-en-bleu'))).toBe(true);
      expect(calls.some((call) => call.includes('push --quiet -u origin conversation/1-mets-le-titre-en-bleu'))).toBe(true);
      expect(calls.some((call) => call.includes('main') && call.includes('push') && !call.includes('conversation/'))).toBe(false);
      expect(preview.restartApplication).toHaveBeenCalledWith('poc');
      expect(stories.commentAsAssistant).toHaveBeenCalledWith(TOKEN, 'poc', 1, 'ADA', 'C’est fait : le titre est bleu.');
      expect(status).toBe('exchange');
      expect(gh.pulls.create).not.toHaveBeenCalled();
    });

    it('a simple question: answer without pushing anything', async () => {
      commits = '0';
      output = [result('{"response":"Le titre est dans l’en-tête."}')];
      await service.converse(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      const calls = preview.run.mock.calls.map((call) => (call[1] as string[]).join(' '));
      expect(calls.some((call) => call.includes('push'))).toBe(false);
      expect(status).toBe('exchange');
    });

    it('knows it has no access to GitHub; the stories for later that it proposes are offered for selection in ADA', async () => {
      commits = '0';
      const proposed = { title: 'Envoyer les tirages', role: 'organisateur', need: 'envoyer les tirages par e-mail', benefit: 'prévenir chacun', criteria: ['Un e-mail par participant'] };
      output = [result(JSON.stringify({ response: 'Voici une story pour plus tard.', stories: [proposed] }))];
      await service.converse(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      const instructions = launch.mock.calls[0]![0][1]!;
      expect(instructions).toContain('Tu n\'as AUCUN accès à GitHub');
      expect(instructions).toContain('"stories":[{"title"');
      const message = stories.commentAsAssistant.mock.calls[0]![4] as string;
      expect(message).toContain('Voici une story pour plus tard.');
      expect(message).toContain('**Envoyer les tirages**');
      expect(readBreakdown(message)).toEqual([proposed]);
      expect(status).toBe('exchange'); // the conversation goes on
    });

    it('a message from the PO relaunches ADA; refused if ADA is not waiting for anything', async () => {
      status = 'exchange';
      output = [result('{"response":"Voilà."}')];
      await service.resumeConversation(TOKEN, 'po1', 'poc', 1, 'plutôt en rouge');
      await service.lastTask;
      expect(stories.reply).toHaveBeenCalledWith(TOKEN, 'poc', 1, 'plutôt en rouge');
      expect(launch).toHaveBeenCalledTimes(1);
      status = 'in-progress';
      await expect(service.resumeConversation(TOKEN, 'po1', 'poc', 1, 'encore')).rejects.toThrow(/n’attend pas de message/);
      status = 'exchange';
      await expect(service.resumeConversation(TOKEN, 'po1', 'poc', 1, '  ')).rejects.toThrow(/Écrivez votre message/);
    });

    it('keeps the thread: the next message resumes the agent\'s session, with short instructions', async () => {
      output = [result('{"response":"Titre en bleu."}')];
      await service.converse(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      const first = launch.mock.calls[0]![0];
      const session = first[first.indexOf('--session-id') + 1]!;
      expect(session).toMatch(/^[0-9a-f-]{36}$/);
      expect(first).not.toContain('--no-session-persistence');
      expect(first[1]).toContain('PHASE : CONVERSATION');
      expect(first[1]).toContain('lance SEULEMENT les tests liés');

      stories.detail = vi.fn(async () => ({ ...conversation(), messages: [...conversation().messages, { id: 3, author: 'po', text: 'Plutôt en rouge', at: '' }] }));
      output = [result('{"response":"Titre en rouge."}')];
      await service.converse(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      const second = launch.mock.calls[1]![0];
      expect(second.slice(second.indexOf('--resume'), second.indexOf('--resume') + 2)).toEqual(['--resume', session]);
      expect(second[1]).toContain('Nouveau message du PO :\nPlutôt en rouge');
      expect(second[1]).not.toContain('PHASE : CONVERSATION');
      expect(stories.commentAsAssistant).toHaveBeenLastCalledWith(TOKEN, 'poc', 1, 'ADA', 'Titre en rouge.');
    });

    it('session not found: starts again from the full instructions, in a new session', async () => {
      output = [result('{"response":"Un."}')];
      await service.converse(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      stories.detail = vi.fn(async () => ({ ...conversation(), messages: [...conversation().messages, { id: 3, author: 'po', text: 'Encore', at: '' }] }));
      let call = 0;
      launch.mockImplementation(async (_args, _cwd, onLine) => {
        call++;
        if (call === 1) return 1; // resuming fails
        onLine(result('{"response":"Deux."}'));
        return 0;
      });
      await service.converse(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      const fallback = launch.mock.calls.at(-1)![0];
      expect(fallback).toContain('--session-id');
      expect(fallback[1]).toContain('PHASE : CONVERSATION');
      expect(stories.commentAsAssistant).toHaveBeenLastCalledWith(TOKEN, 'poc', 1, 'ADA', 'Deux.');
    });

    it('“all good”: ADA runs the full checks, then the PR opens and the request moves to review', async () => {
      status = 'exchange';
      output = [result('{"response":"Le titre est bleu et plus grand.","ready":true}')];
      await service.finishConversation(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      expect(stories.reply).toHaveBeenCalledWith(TOKEN, 'poc', 1, expect.stringContaining('C’est bon'));
      expect(launch.mock.calls[0]![0][1]).toContain('LE PO A DIT « C\'EST BON »');
      expect(gh.pulls.create).toHaveBeenCalledWith(expect.objectContaining({ head: 'conversation/1-mets-le-titre-en-bleu', base: 'main', title: 'feat: mets le titre en bleu' }));
      expect(stories.commentAsAssistant).toHaveBeenCalledWith(TOKEN, 'poc', 1, 'Changements proposés au projet', expect.stringContaining('Le titre est bleu et plus grand.'));
      expect(status).toBe('in-review');
    });

    it('“all good” but a check still fails: no PR, ADA says so, the conversation goes on', async () => {
      status = 'exchange';
      output = [result('{"response":"Le test de la page d’accueil échoue encore.","ready":false}')];
      await service.finishConversation(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      expect(gh.pulls.create).not.toHaveBeenCalled();
      expect(stories.commentAsAssistant).toHaveBeenCalledWith(TOKEN, 'poc', 1, 'Pas encore prêt', expect.stringContaining('échoue encore'));
      expect(status).toBe('exchange');
    });

    it('“all good” with no change at all: the conversation closes, without a PR', async () => {
      status = 'exchange';
      commits = '0';
      output = [result('{"response":"Rien à changer.","ready":true}')];
      await service.finishConversation(TOKEN, 'po1', 'poc', 1);
      await service.lastTask;
      expect(gh.pulls.create).not.toHaveBeenCalled();
      expect(stories.closeAsNotPlanned).toHaveBeenCalledWith(TOKEN, 'poc', 1, expect.stringContaining('sans changement'));
    });

    it('stop: nothing is added to the project', async () => {
      status = 'exchange';
      await service.stopConversation(TOKEN, 'po1', 'poc', 1);
      expect(stories.closeAsNotPlanned).toHaveBeenCalledWith(TOKEN, 'poc', 1, expect.stringContaining('rien n’est ajouté au projet'));
      expect(gh.pulls.create).not.toHaveBeenCalled();
    });
  });
});
