/**
 * Carbon footprint of ADA's usage (model inference), estimated as a RANGE.
 *
 * Method: EcoLogits (GenAI Impact), an open life-cycle assessment method, which relies on the
 * ADEME Base Empreinte: https://ecologits.ai/latest/methodology/llm_inference/
 * Equivalents: Impact CO2 (ADEME), https://impactco2.fr (public API, values of 2026-11-18).
 *
 * Limits, to display with the figure:
 * - Anthropic publishes neither the size of its models nor their consumption: the sizes below
 *   are ASSUMPTIONS (EcoLogits estimate for Claude 3 Opus), to replace when known;
 * - like EcoLogits, only the tokens PRODUCED count; reading (context, cache) is not
 *   counted: it is a lower bound for an agent that reads a lot;
 * - model training and the workstation are not counted.
 * The computations are redone at each display from the raw log (tokens per model):
 * improving an assumption corrects the whole history.
 */

/** A usage recorded at the end of an agent run: tokens per model (Claude's report). */
export interface ModelUsage {
  model: string;
  inputTokenCount: number;
  outputTokenCount: number;
}

export interface Range {
  min: number;
  max: number;
}

export interface Footprint {
  /** Energy consumed, in Wh. */
  energyWh: Range;
  /** Emissions, in g CO2e (electricity + share of server manufacturing). */
  co2Grams: Range;
  outputTokenCount: number;
  inputTokenCount: number;
}

interface ModelAssumption {
  /** Total parameters (billions): sets the number of GPUs needed. */
  totalBillions: number;
  /** Active parameters per token (billions), range (mixture-of-experts model, 10 to 30% active). */
  activeBillions: Range;
  source: string;
}

/**
 * Assumed sizes of the Claude families. Only Opus has a published estimate (EcoLogits, Claude 3
 * Opus: ~2,000 billion, 200 to 600 active); Sonnet and Haiku are ADA's assumptions, smaller,
 * to replace as soon as a sourced estimate exists.
 */
export const MODEL_ASSUMPTIONS: Record<'opus' | 'sonnet' | 'haiku', ModelAssumption> = {
  opus: { totalBillions: 2000, activeBillions: { min: 200, max: 600 }, source: 'EcoLogits, estimation pour Claude 3 Opus' },
  sonnet: { totalBillions: 1000, activeBillions: { min: 100, max: 300 }, source: 'hypothèse ADA (moitié d’Opus)' },
  haiku: { totalBillions: 300, activeBillions: { min: 30, max: 90 }, source: 'hypothèse ADA' },
};

/** EcoLogits constants (“LLM inference” methodology). */
const ECOLOGITS = {
  alpha: 1.17e-6,
  beta: -1.12e-2,
  gamma: 4.05e-5,
  batch: 64,
  serverNonGpuPowerWatts: 1200,
  gpusPerServer: 8,
  gpuMemoryGb: 80,
  memoryOverhead: 1.2,
  bytesPerParameter: 2,
  /** PUE of the data centers used by Anthropic (AWS, Google), according to EcoLogits. */
  pue: { min: 1.09, max: 1.14 },
  /** Manufacturing: server without GPU (kg CO2e), H100 GPU, lifetime (years). */
  serverManufacturingKg: 5700,
  gpuManufacturingKg: 273,
  lifetimeYears: 3,
};

/** ADA's assumption: generation throughput, for how long the servers are busy. */
const TOKENS_PER_SECOND = 40;

/** Electricity in the United States (Anthropic's data centers): Ember 2024, source of Our World in Data. */
export const G_CO2_PER_KWH = 384;

/**
 * Official ADEME equivalents (Impact CO2, full life cycle, values read on 2026-11-19),
 * except `ledBulbWatts`, ADA's assumption (not ADEME's): a power, to translate an energy.
 */
export const EQUIVALENTS = {
  /** One hour of video streaming (“Digital usage” theme). */
  streamingHourGrams: 64,
  /** One kilometre in a combustion car (“Transport” theme). */
  carKmGrams: 142.25,
  /** One web search (“Digital usage” theme). */
  webSearchGrams: 1.23,
  /** A Paris–Marseille return trip by high-speed train (“Practical cases”). */
  parisMarseilleReturnTrainGrams: 4400,
  /** A Paris–New York return flight, per person (“Practical cases”). */
  parisNewYorkReturnFlightGrams: 2_060_000,
  /** ADA's assumption: power of an LED bulb, to say “a bulb switched on for…”. */
  ledBulbWatts: 10,
};

function assumption(model: string): ModelAssumption {
  const name = model.toLowerCase();
  if (name.includes('haiku')) return MODEL_ASSUMPTIONS.haiku;
  if (name.includes('sonnet')) return MODEL_ASSUMPTIONS.sonnet;
  // Opus, and any unknown model: the most cautious (the largest).
  return MODEL_ASSUMPTIONS.opus;
}

function gpuCount(totalBillions: number): number {
  const memoryGb = ECOLOGITS.memoryOverhead * totalBillions * ECOLOGITS.bytesPerParameter;
  const raw = Math.ceil(memoryGb / ECOLOGITS.gpuMemoryGb);
  return 2 ** Math.ceil(Math.log2(Math.max(1, raw)));
}

/** Energy (Wh) and CO2e (g) for produced tokens, with a given active size and PUE. */
function compute(outputTokenCount: number, h: ModelAssumption, active: number, pue: number): { wh: number; g: number } {
  const gpu = gpuCount(h.totalBillions);
  const whPerTokenPerGpu = ECOLOGITS.alpha * Math.exp(ECOLOGITS.beta * ECOLOGITS.batch) * active + ECOLOGITS.gamma;
  const gpuEnergy = outputTokenCount * whPerTokenPerGpu * gpu;
  const durationHours = outputTokenCount / TOKENS_PER_SECOND / 3600;
  const nonGpuEnergy = (durationHours * ECOLOGITS.serverNonGpuPowerWatts * (gpu / ECOLOGITS.gpusPerServer)) / ECOLOGITS.batch;
  const wh = pue * (gpuEnergy + nonGpuEnergy);
  const manufacturingKg = (gpu / ECOLOGITS.gpusPerServer) * ECOLOGITS.serverManufacturingKg + gpu * ECOLOGITS.gpuManufacturingKg;
  const manufacturingShare = durationHours / (ECOLOGITS.batch * ECOLOGITS.lifetimeYears * 365 * 24);
  return { wh, g: (wh / 1000) * G_CO2_PER_KWH + manufacturingShare * manufacturingKg * 1000 };
}

export function footprint(usages: ModelUsage[]): Footprint {
  const total: Footprint = { energyWh: { min: 0, max: 0 }, co2Grams: { min: 0, max: 0 }, outputTokenCount: 0, inputTokenCount: 0 };
  for (const usage of usages) {
    const h = assumption(usage.model);
    const lower = compute(usage.outputTokenCount, h, h.activeBillions.min, ECOLOGITS.pue.min);
    const upper = compute(usage.outputTokenCount, h, h.activeBillions.max, ECOLOGITS.pue.max);
    total.energyWh.min += lower.wh;
    total.energyWh.max += upper.wh;
    total.co2Grams.min += lower.g;
    total.co2Grams.max += upper.g;
    total.outputTokenCount += usage.outputTokenCount;
    total.inputTokenCount += usage.inputTokenCount;
  }
  return total;
}

/** Usages per model, read in Claude's “result” event (modelUsage field). */
export function readUsages(modelUsage: unknown): ModelUsage[] {
  if (!modelUsage || typeof modelUsage !== 'object') return [];
  return Object.entries(modelUsage as Record<string, Record<string, unknown>>).map(([model, u]) => ({
    model,
    inputTokenCount: ['inputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens'].reduce((sum, key) => sum + (Number(u?.[key]) || 0), 0),
    outputTokenCount: Number(u?.outputTokens) || 0,
  }));
}
