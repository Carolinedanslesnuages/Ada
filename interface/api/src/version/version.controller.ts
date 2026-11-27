import { Controller, Get, Header } from '@nestjs/common';
import { readFileSync } from 'node:fs';

/** repo-version-json contract (Dockerflow format): the file of the image, otherwise “dev”. */
export const DEV_VERSION = {
  source: '',
  version: 'dev',
  commit: '',
  build: '',
  code_date: '',
  changes: [],
  history: [],
};

@Controller()
export class VersionController {
  @Get(['__version__', 'api/__version__'])
  @Header('Cache-Control', 'no-store')
  version(): unknown {
    try {
      return JSON.parse(readFileSync(process.env.VERSION_JSON ?? '/app/version.json', 'utf8'));
    } catch {
      return { ...DEV_VERSION };
    }
  }
}
