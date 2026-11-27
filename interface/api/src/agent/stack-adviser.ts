/**
 * Stack advice at creation (#68): the assistant reads the PO's idea and proposes the best-suited
 * shipped template, with one sentence of explanation. Without tools, in an empty disposable folder.
 */
import { BadRequestException, ConflictException, HttpException, type Logger } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../config.js';
import { MAX_IDEA_LENGTH } from '../projects/project.js';
import type { ProjectsService } from '../projects/projects.service.js';
import { stackAdviceInstructions, readStackAdvice, FORBIDDEN_ADVICE_TOOLS, type StackAdvice } from './stack-advice.js';
import { modelOption, type AgentLauncher } from './launch.js';
import { ISOLATION_OPTIONS } from './tools.js';

/** Stack advice running at the same time: each one launches an agent, without a project lock. */
const MAX_ADVICE = 3;

export class StackAdviser {
  private inProgress = 0;

  constructor(
    private readonly config: Config,
    private readonly projects: ProjectsService,
    /** The agent to launch, read at each advice (the tests replace it). */
    private readonly launchAgent: () => AgentLauncher,
    private readonly log: Logger,
  ) {}

  async adviser(idea: unknown): Promise<StackAdvice> {
    if (!this.config.AGENT_COMMAND) {
      throw new BadRequestException('Aucun agent n’est configuré pour cet atelier (AGENT_COMMAND). Choisissez la stack vous-même.');
    }
    const text = typeof idea === 'string' ? idea.trim() : '';
    if (text.length < 10 || text.length > MAX_IDEA_LENGTH) {
      throw new BadRequestException('Racontez votre idée (une phrase au moins) pour qu’ADA puisse vous conseiller');
    }
    if (this.inProgress >= MAX_ADVICE) {
      throw new HttpException('ADA est très sollicitée en ce moment : réessayez dans un instant, ou choisissez la stack vous-même.', 429);
    }
    const { templates, types } = this.projects.templates();
    const available = templates.filter((template) => template.available);
    this.inProgress++;
    let folder = '';
    let response = '';
    try {
      folder = await mkdtemp(join(tmpdir(), 'ada-conseil-'));
      const args = [
        '-p',
        stackAdviceInstructions(text, available, types),
        '--output-format',
        'stream-json',
        '--verbose',
        ...modelOption(this.config.AGENT_MODEL),
        '--max-turns',
        '2',
        ...ISOLATION_OPTIONS,
        '--no-session-persistence',
        '--disallowedTools',
        ...FORBIDDEN_ADVICE_TOOLS,
      ];
      await this.launchAgent()(args, folder, (line) => {
        try {
          const evt = JSON.parse(line) as { type?: string; result?: string };
          if (evt.type === 'result' && typeof evt.result === 'string') response = evt.result;
        } catch {
          /* non-JSON line: ignored */
        }
      });
    } catch (e) {
      this.log.warn(`Stack advice failed: ${(e as Error).message}`);
    } finally {
      this.inProgress--;
      if (folder) await rm(folder, { recursive: true, force: true });
    }
    const advice = readStackAdvice(response, available.map((template) => template.id));
    if (!advice) throw new ConflictException('ADA n’a pas pu proposer de stack : choisissez-la vous-même dans la liste.');
    return advice;
  }
}
