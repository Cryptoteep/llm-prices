export interface ModelEntry {
  id: string;
  provider: string;
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cached-read tokens, null if not supported */
  cacheRead: number | null;
  /** USD per 1M cache-write tokens, null if not supported */
  cacheWrite: number | null;
  /** Max input tokens (context window) */
  context: number | null;
  /** Max output tokens */
  maxOutput: number | null;
}

export interface Usage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface Cost {
  id: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Total cost in USD */
  total: number;
}

export interface Price {
  id: string;
  input: number;
  output: number;
  cacheRead: number | null;
  cacheWrite: number | null;
}

/** All model entries keyed by model id. */
export const models: Record<string, Omit<ModelEntry, "id">>;

/** ISO date (YYYY-MM-DD) the price data was last regenerated. */
export const updated: string;

export function getModel(id: string): ModelEntry | null;
export function getPrice(id: string): Price | null;
export function calcCost(id: string, usage?: Usage): Cost | null;
export function listModels(options?: { provider?: string }): ModelEntry[];
export function listProviders(): string[];
export function compare(ids: string[]): ModelEntry[];
