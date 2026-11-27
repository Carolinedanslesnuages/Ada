/**
 * Worker process: runs ONE task of the assistant (analysis or implementation) outside the
 * API, to outlive its restarts. Launched by AgentService with the path of a task
 * file (readable by the user only), deleted as soon as it is read.
 */
import 'reflect-metadata';
import 'dotenv/config';
import { readFile, rm } from 'node:fs/promises';
import { PreviewService } from '../preview/preview.service.js';
import { readConfig } from '../config.js';
import { GithubService } from '../github/github.service.js';
import { WorkRequestStore } from '../stories/work-requests.js';
import { StoriesService } from '../stories/stories.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { Task } from './agent.js';
import { AgentService } from './agent.service.js';
import { parseStored } from '../legacy/legacy-storage.js';

const taskFile = process.argv[2];
if (!taskFile) {
  console.error('Usage: node worker.js <task file>');
  process.exit(1);
}
const task = parseStored<Task>(await readFile(taskFile, 'utf8'));
await rm(taskFile, { force: true });

const config = readConfig();
const github = new GithubService();
const preview = new PreviewService(config);
const agent = new AgentService(config, github, new StoriesService(config, github, new WorkRequestStore(config)), preview, new ProjectsService(config, github, preview));
agent.usesSeparateWorker = false;
console.log(`[${new Date().toISOString()}] ${task.repository}#${task.number}: ${task.phase} (process ${process.pid})`);
try {
  await agent.runTask(task);
  console.log(`[${new Date().toISOString()}] ${task.repository}#${task.number}: done`);
} catch (error) {
  // Errors that happened outside the task tracking (e.g. invalid project): logged, without a raw stack.
  console.error(`[${new Date().toISOString()}] ${task.repository}#${task.number}: failed — ${(error as Error).message}`);
  process.exitCode = 1;
}
