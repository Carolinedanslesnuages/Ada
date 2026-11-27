import { Inject, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CONFIG, type Config } from '../config.js';
import { parseIdentifier } from '../projects/repository.js';
import { save, type RegistryEntry, type Origin } from './registry.js';
import { parseStored } from '../legacy/legacy-storage.js';

/**
 * Registry of the projects created or adopted by ADA, in a file outside git. GitHub stays the source
 * of truth of each project; the registry only keeps the trace that it existed, so that the
 * indicators also count the projects archived or deleted since.
 */
@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);
  private writing: Promise<void> = Promise.resolve();

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  private get file(): string {
    return join(resolve(this.config.REGISTRY_DIR), 'projets.json');
  }

  async read(): Promise<RegistryEntry[]> {
    if (!existsSync(this.file)) return this.bootstrapRepository();
    try {
      return parseStored<RegistryEntry[]>(await readFile(this.file, 'utf8'));
    } catch (e) {
      this.logger.warn(`Registry unreadable: ${(e as Error).message}`);
      return [];
    }
  }

  /** Records a project (creation, adoption, or first trace); never blocking for the PO. */
  async record(id: string, origin: Origin, by: string | null, at = new Date().toISOString()): Promise<void> {
    this.writing = this.writing.then(async () => {
      try {
        const { owner, repo } = parseIdentifier(id, this.config.GITHUB_OWNER);
        const before = await this.read();
        const after = save(before, { id: id.toLowerCase(), owner, repo, origin, at, by });
        if (after !== before) await this.write(after);
      } catch (e) {
        this.logger.warn(`Registry: ${id} not recorded (${(e as Error).message})`);
      }
    });
    return this.writing;
  }

  private async write(registry: RegistryEntry[]): Promise<void> {
    await mkdir(resolve(this.config.REGISTRY_DIR), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`);
    await rename(temporary, this.file);
  }

  /**
   * First start: the projects from before the registry left a trace, the folder of their
   * preview. They enter it with an unknown origin, dated from the creation of that folder.
   */
  private async bootstrapRepository(): Promise<RegistryEntry[]> {
    const root = resolve(this.config.PREVIEWS_DIR);
    let registry: RegistryEntry[] = [];
    const folders = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const folder of folders.filter((element) => element.isDirectory())) {
      try {
        const { owner, repo } = parseIdentifier(folder.name, this.config.GITHUB_OWNER);
        const { birthtime } = await stat(join(root, folder.name));
        registry = save(registry, { id: folder.name, owner, repo, origin: 'unknown', at: birthtime.toISOString(), by: null });
      } catch {
        // folder that is not a project
      }
    }
    await this.write(registry);
    this.logger.log(`Registry created with ${registry.length} already known project(s)`);
    return registry;
  }
}
