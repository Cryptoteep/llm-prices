export type Capability = "vision" | "tools" | "cache" | "reasoning" | "pdf" | "audio";

export interface LongContextPricing {
  /** Prompt size (tokens) above which the surcharge rates apply */
  threshold: number;
  /** USD per 1M input tokens above the threshold */
  input: number;
  /** USD per 1M output tokens above the threshold */
  output: number;
  cacheRead: number | null;
  cacheWrite: number | null;
}

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
  /** Declared capabilities, omitted when the source lists none */
  caps?: Capability[];
  /** Surcharge rates for prompts over `threshold` tokens, when the model has them */
  longContext?: LongContextPricing;
  /** ISO date the provider retires the model, when announced */
  deprecated?: string;
}

export interface Usage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface CostOptions {
  /** "auto" (default) applies long-context rates by prompt size; "base"/"long" force one */
  tier?: "auto" | "base" | "long";
}

export interface Cost {
  id: string;
  /** Which rate table was used */
  tier: "base" | "long";
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

export interface ListOptions {
  provider?: string;
  /** Every listed capability must be present */
  caps?: Capability | Capability[] | string | string[];
  minContext?: number;
  /** Include models whose retirement date has passed (excluded by default) */
  includeDeprecated?: boolean;
}

export interface CheapestOptions extends ListOptions {
  /** Input tokens the ranking is priced on (default 1,000,000) */
  input?: number;
  /** Output tokens the ranking is priced on (default 1,000,000) */
  output?: number;
  /** How many entries to return (default 1) */
  limit?: number;
}

export interface RankedModel extends ModelEntry {
  /** USD for the workload the ranking was priced on */
  cost: number;
}

export interface TrackerRow {
  id: string;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** USD */
  cost: number;
}

/** All model entries keyed by model id. */
export const models: Record<string, Omit<ModelEntry, "id">>;

/** ISO date (YYYY-MM-DD) the price data was last regenerated. */
export const updated: string;

export function getModel(id: string): ModelEntry | null;
export function getPrice(id: string): Price | null;
export function calcCost(id: string, usage?: Usage, options?: CostOptions): Cost | null;

/** Cost for a raw `usage` object off an Anthropic / OpenAI / Google SDK response. */
export function calcCostFromUsage(
  id: string,
  usage: unknown,
  options?: CostOptions
): Cost | null;

/** Normalize a provider SDK `usage` object into plain token counts. */
export function normalizeUsage(usage: unknown): Required<Usage>;

export function listModels(options?: ListOptions): ModelEntry[];
export function listProviders(): string[];

/** Models ranked by cost for a workload, cheapest first. */
export function cheapest(options?: CheapestOptions): RankedModel[];

/** Model ids matching a query, best match first. */
export function search(query: string): string[];

export function compare(ids: string[]): ModelEntry[];

/** Running spend across many calls. */
export class CostTracker {
  calls: number;
  /** USD */
  total: number;
  byModel: Record<string, TrackerRow>;
  add(id: string, usage: unknown, options?: CostOptions): Cost;
  /** Per-model rows, most expensive first. */
  rows(): TrackerRow[];
  reset(): void;
}
