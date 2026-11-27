import { describe, expect, it } from 'vitest';
import type { WorkRequest } from './agent.js';
import { isLargeWorkRequest, breakdownRetry } from './breakdown-retry.js';

function workRequest(parts: Partial<WorkRequest> = {}, size = 2000): WorkRequest {
  return {
    number: 1, title: 'Vision', type: 'free', content: null, bugContent: null,
    freeContent: 'x'.repeat(size), exchanges: [], ...parts,
  };
}

describe('isLargeWorkRequest', () => {
  it('relaunches a long first analysis', () => {
    expect(isLargeWorkRequest(workRequest(), 'Que voulez-vous ?')).toBe(true);
  });
  it('does not relaunch a short request', () => {
    expect(isLargeWorkRequest(workRequest({}, 300), 'Que voulez-vous ?')).toBe(false);
  });
  it('does not relaunch after an answer from the PO', () => {
    expect(isLargeWorkRequest(workRequest({ exchanges: [{ author: 'po', text: 'oui' }] }), 'Et ensuite ?')).toBe(false);
  });
  it('does not relaunch a bug report', () => {
    expect(isLargeWorkRequest(workRequest({ type: 'bug' }), 'Où ?')).toBe(false);
  });
  it('does not relaunch when the questions are about a duplicate', () => {
    const existingStories = [{ number: 4, title: 'Liste', status: 'delivered' }] as unknown as WorkRequest['existingStories'];
    expect(isLargeWorkRequest(workRequest({ existingStories }), 'Déjà prévu en #4 : continuer ici ?')).toBe(false);
  });
  it('counts the content of a story', () => {
    const content = { role: 'a', need: 'y'.repeat(1600), benefit: 'b', criteria: ['c'] };
    expect(isLargeWorkRequest(workRequest({ type: 'story', content, freeContent: null }), 'Q ?')).toBe(true);
  });
  it('the retry recalls the questions and asks for a breakdown', () => {
    expect(breakdownRetry('Q1 ?')).toContain('Q1 ?');
    expect(breakdownRetry('Q1 ?')).toContain('breakdown');
  });
});
