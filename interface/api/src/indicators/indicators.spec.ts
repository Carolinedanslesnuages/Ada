import type { ProjectsSummary } from './registry.js';
import { describe, it, expect } from 'vitest';
import { computeIndicators, readHistory, type MeasuredWorkRequest } from './indicators.js';

const delivered = (launchedAt: string | null, closedAt: string): MeasuredWorkRequest => ({ delivered: true, launchedAt, closedAt });
const open: MeasuredWorkRequest = { delivered: false, launchedAt: '2026-11-16T10:00:00Z', closedAt: null };

const NONE: ProjectsSummary = { total: 0, created: 0, adopted: 0, active: 0, archives: 0, removed: 0, deleted: 0 };

describe('Indicators', () => {
  it('counts the projects and the delivered stories, overall and per project', () => {
    const indicators = computeIndicators([
      { name: 'ready', workRequests: [delivered(null, '2026-11-16T12:00:00Z'), delivered(null, '2026-11-16T13:00:00Z'), open] },
      { name: 'annuaire', workRequests: [delivered(null, '2026-11-16T12:00:00Z')] },
      { name: 'vide', workRequests: [] },
    ], NONE);
    expect(indicators.projects).toBe(3);
    expect(indicators.deliveredStories).toBe(3);
    expect(indicators.byProject.map((project) => [project.name, project.deliveredStories])).toEqual([
      ['ready', 2],
      ['annuaire', 1],
      ['vide', 0],
    ]);
  });

  it('average time from launch to delivery, in minutes, without the requests never launched from ADA', () => {
    const indicators = computeIndicators([
      { name: 'ready', workRequests: [delivered('2026-11-16T10:00:00Z', '2026-11-16T10:20:00Z'), delivered('2026-11-16T11:00:00Z', '2026-11-16T11:40:00Z'), delivered(null, '2026-11-16T12:00:00Z')] },
    ], NONE);
    expect(indicators.averageDurationMinutes).toBe(30);
    expect(computeIndicators([{ name: 'ancien', workRequests: [delivered(null, '2026-11-16T12:00:00Z')] }], NONE).averageDurationMinutes).toBeNull();
  });

  it('reads the launch in the label history', () => {
    const history = readHistory(
      [
        { event: 'labeled', created_at: '2026-11-16T10:05:00Z', label: { name: 'user-story' } },
        { event: 'labeled', created_at: '2026-11-16T10:10:00Z', label: { name: 'story:en-cours' } },
        { event: 'unlabeled', created_at: '2026-11-16T10:30:00Z', label: { name: 'story:en-cours' } },
        { event: 'labeled', created_at: '2026-11-16T10:31:00Z', label: { name: 'story:besoin-dev' } },
        { event: 'labeled', created_at: '2026-11-16T11:00:00Z', label: { name: 'story:en-cours' } },
        { event: 'closed', created_at: '2026-11-16T12:00:00Z' },
      ],
      'story:en-cours',
    );
    expect(history).toEqual({ launchedAt: '2026-11-16T10:10:00Z' });
    expect(readHistory([], 'story:en-cours')).toEqual({ launchedAt: null });
  });
});
