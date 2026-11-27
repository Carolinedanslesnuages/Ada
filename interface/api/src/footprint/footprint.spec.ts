import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EQUIVALENTS, G_CO2_PER_KWH, footprint, readUsages } from './footprint.js';
import { readFootprints, recordFootprint, sumUp, turnUsages, type FootprintEntry } from './footprint-log.js';

describe('Carbon footprint (EcoLogits method, ADEME equivalents)', () => {
  it('reads the tokens per model in Claude\'s report (read = input + cache)', () => {
    expect(
      readUsages({ 'claude-opus-5-5': { inputTokens: 2, cacheReadInputTokens: 24027, cacheCreationInputTokens: 11007, outputTokens: 4 } }),
    ).toEqual([{ model: 'claude-opus-5-5', inputTokenCount: 35036, outputTokenCount: 4 }]);
    expect(readUsages(undefined)).toEqual([]);
  });

  it('a range, whose order of magnitude follows EcoLogits for a model the size of Opus', () => {
    const result = footprint([{ model: 'claude-opus-5-5', inputTokenCount: 0, outputTokenCount: 1000 }]);
    // 64 GPUs (2,000 billion parameters); 200 to 600 billion active; PUE 1.09 to 1.14.
    expect(result.energyWh.min).toBeGreaterThan(9);
    expect(result.energyWh.min).toBeLessThan(13);
    expect(result.energyWh.max).toBeGreaterThan(24);
    expect(result.energyWh.max).toBeLessThan(32);
    // Electricity (384 g/kWh) plus a small share of server manufacturing.
    expect(result.co2Grams.min).toBeGreaterThan((result.energyWh.min / 1000) * G_CO2_PER_KWH);
    expect(result.co2Grams.min).toBeLessThan((result.energyWh.min / 1000) * G_CO2_PER_KWH * 1.5);
  });

  it('proportional to the tokens produced; a small model costs less', () => {
    const one = footprint([{ model: 'claude-opus-5-5', inputTokenCount: 0, outputTokenCount: 1000 }]);
    const two = footprint([{ model: 'claude-opus-5-5', inputTokenCount: 0, outputTokenCount: 2000 }]);
    expect(two.co2Grams.max).toBeCloseTo(one.co2Grams.max * 2, 6);
    const haiku = footprint([{ model: 'claude-haiku-5-5', inputTokenCount: 0, outputTokenCount: 1000 }]);
    expect(haiku.co2Grams.max).toBeLessThan(one.co2Grams.max / 4);
    // Unknown model: the most cautious, like Opus.
    expect(footprint([{ model: 'modele-inconnu', inputTokenCount: 0, outputTokenCount: 1000 }]).co2Grams.max).toBeCloseTo(one.co2Grams.max, 6);
  });

  it('official ADEME equivalents (Impact CO2)', () => {
    expect(EQUIVALENTS).toEqual({
      streamingHourGrams: 64,
      carKmGrams: 142.25,
      webSearchGrams: 1.23,
      parisMarseilleReturnTrainGrams: 4400,
      parisNewYorkReturnFlightGrams: 2_060_000,
      ledBulbWatts: 10,
    });
  });

  it('log: one line per run, without content, read back and added up', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'empreinte-'));
    await recordFootprint(folder, { at: '2026-11-18T10:00:00Z', project: 'gladys', number: 3, phase: 'conversation', usages: [{ model: 'claude-opus-5-5', inputTokenCount: 5, outputTokenCount: 100 }] });
    await recordFootprint(folder, { at: '2026-11-18T10:05:00Z', project: 'gladys', number: 3, phase: 'conversation', usages: [] });
    await recordFootprint(folder, { at: '2026-11-18T10:10:00Z', project: 'gladys', number: 3, phase: 'conversation', usages: [{ model: 'claude-opus-5-5', inputTokenCount: 5, outputTokenCount: 300 }] });
    const entries = await readFootprints(folder);
    expect(entries).toHaveLength(2);
    expect(sumUp(entries).outputTokenCount).toBe(400);
    expect(await readFootprints(join(folder, 'absent'))).toEqual([]);
  });

  it('resumed session: Claude reports the session total; only the difference of each turn is counted', () => {
    const turn = (at: string, output: number, entry: number, session: string | null = 'S1'): FootprintEntry => ({
      at, project: 'gladys', number: 30, phase: 'conversation', session, usages: [{ model: 'claude-opus-5-5', inputTokenCount: entry, outputTokenCount: output }],
    });
    const entries = [turn('1', 173, 24029), turn('2', 177, 59971), turn('3', 500, 1000, null)];
    expect(turnUsages(entries).map((usages) => usages[0]!.outputTokenCount)).toEqual([173, 4, 500]);
    expect(sumUp(entries).outputTokenCount).toBe(677);
    // A model absent from the previous turn counts in full; never negative.
    const other = turnUsages([turn('1', 100, 10), { ...turn('2', 50, 5), usages: [{ model: 'claude-haiku-5-5', inputTokenCount: 5, outputTokenCount: 50 }] }])
    expect(other[1]![0]).toEqual({ model: 'claude-haiku-5-5', inputTokenCount: 5, outputTokenCount: 50 });
    expect(turnUsages([turn('1', 100, 10), turn('2', 80, 5)])[1]![0]!.outputTokenCount).toBe(0);
  });
});
