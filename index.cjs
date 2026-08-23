"use strict";

const data = require("./data/prices.json");

/** All model entries keyed by model id. */
const models = data.models;

/** ISO date (YYYY-MM-DD) the price data was last regenerated. */
const updated = data.updated;

const lower = (s) => String(s).toLowerCase();

/**
 * Ids matching a query: exact, then case-insensitive, then substring.
 * Ordered best-match first; empty when nothing matches.
 */
function search(query) {
  if (!query || typeof query !== "string") return [];
  if (models[query]) return [query];
  const q = lower(query);
  const exact = Object.keys(models).filter((k) => lower(k) === q);
  if (exact.length) return exact;
  return Object.keys(models)
    .filter((k) => lower(k).includes(q))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/**
 * Resolve a model id to its entry. Matching order:
 * exact id → case-insensitive id → unique substring match.
 * Returns null when nothing (or more than one candidate) matches.
 */
function getModel(id) {
  const hits = search(id);
  if (hits.length !== 1) return null;
  return { id: hits[0], ...models[hits[0]] };
}

/**
 * Price info for a model: USD per 1M tokens.
 * { input, output, cacheRead, cacheWrite } or null if unknown model.
 */
function getPrice(id) {
  const m = getModel(id);
  if (!m) return null;
  return {
    id: m.id,
    input: m.input,
    output: m.output,
    cacheRead: m.cacheRead,
    cacheWrite: m.cacheWrite,
  };
}

/** True when the provider's retirement date for this model has passed. */
function isDeprecated(entry, on = new Date()) {
  return !!entry.deprecated && new Date(entry.deprecated) <= on;
}

/**
 * Cost in USD for the given token usage.
 * usage: { input, output, cacheRead, cacheWrite } — token counts.
 * options: { tier: "auto" | "base" | "long" } — long-context surcharge handling.
 * Returns { id, tier, input, output, cacheRead, cacheWrite, total } in USD, or null.
 */
function calcCost(id, usage = {}, options = {}) {
  const m = getModel(id);
  if (!m) return null;

  const promptTokens =
    (usage.input || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0);
  const tierMode = options.tier || "auto";
  const useLong =
    !!m.longContext &&
    (tierMode === "long" ||
      (tierMode === "auto" && promptTokens > m.longContext.threshold));
  const rates = useLong ? m.longContext : m;

  const part = (tokens, pricePerM) =>
    tokens && pricePerM != null ? (tokens / 1e6) * pricePerM : 0;
  const input = part(usage.input, rates.input);
  const output = part(usage.output, rates.output);
  const cacheRead = part(usage.cacheRead, rates.cacheRead);
  const cacheWrite = part(usage.cacheWrite, rates.cacheWrite);
  return {
    id: m.id,
    tier: useLong ? "long" : "base",
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  };
}

/**
 * Normalize a raw `usage` object from a provider SDK into token counts.
 * Understands Anthropic, OpenAI (chat + responses) and Google shapes, and
 * subtracts cached tokens from the input count where the provider includes
 * them (OpenAI, Google) but not where it does not (Anthropic).
 */
function normalizeUsage(usage) {
  const empty = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (!usage || typeof usage !== "object") return empty;

  // Google GenAI
  if (usage.promptTokenCount != null || usage.candidatesTokenCount != null) {
    const cacheRead = usage.cachedContentTokenCount || 0;
    return {
      input: Math.max((usage.promptTokenCount || 0) - cacheRead, 0),
      output: usage.candidatesTokenCount || 0,
      cacheRead,
      cacheWrite: 0,
    };
  }

  // Anthropic: input_tokens excludes cached tokens
  if (
    usage.cache_creation_input_tokens != null ||
    usage.cache_read_input_tokens != null
  ) {
    return {
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0,
      cacheWrite: usage.cache_creation_input_tokens || 0,
    };
  }

  // OpenAI responses API: input_tokens includes cached tokens
  if (usage.input_tokens != null && usage.input_tokens_details) {
    const cacheRead = usage.input_tokens_details.cached_tokens || 0;
    return {
      input: Math.max((usage.input_tokens || 0) - cacheRead, 0),
      output: usage.output_tokens || 0,
      cacheRead,
      cacheWrite: 0,
    };
  }

  // OpenAI chat completions: prompt_tokens includes cached tokens
  if (usage.prompt_tokens != null || usage.completion_tokens != null) {
    const cacheRead = (usage.prompt_tokens_details || {}).cached_tokens || 0;
    return {
      input: Math.max((usage.prompt_tokens || 0) - cacheRead, 0),
      output: usage.completion_tokens || 0,
      cacheRead,
      cacheWrite: 0,
    };
  }

  // Bare Anthropic-style, or already-normalized token counts
  return {
    input: usage.input != null ? usage.input : usage.input_tokens || 0,
    output: usage.output != null ? usage.output : usage.output_tokens || 0,
    cacheRead: usage.cacheRead || 0,
    cacheWrite: usage.cacheWrite || 0,
  };
}

/**
 * Cost for a raw `usage` object straight off a provider SDK response:
 * calcCostFromUsage("claude-opus-5", response.usage)
 */
function calcCostFromUsage(id, usage, options) {
  return calcCost(id, normalizeUsage(usage), options);
}

/**
 * List model entries.
 * options: { provider, caps: string|string[], minContext, includeDeprecated }
 * Returns array of { id, ...entry } sorted by provider, then id.
 */
function listModels(options = {}) {
  let entries = Object.entries(models).map(([id, m]) => ({ id, ...m }));
  if (options.provider) {
    const p = lower(options.provider);
    entries = entries.filter((m) => m.provider === p);
  }
  if (options.caps) {
    const want = [].concat(options.caps).map(lower);
    entries = entries.filter((m) => want.every((c) => (m.caps || []).includes(c)));
  }
  if (options.minContext) {
    entries = entries.filter((m) => (m.context || 0) >= options.minContext);
  }
  if (!options.includeDeprecated) {
    entries = entries.filter((m) => !isDeprecated(m));
  }
  return entries.sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id)
  );
}

/**
 * Cheapest models for a given workload, cheapest first.
 * options: listModels filters plus
 *   { input = 1e6, output = 1e6 } — the workload the ranking is priced on
 *   { limit = 1 } — how many entries to return
 * Each entry carries a `cost` field: USD for that workload.
 */
function cheapest(options = {}) {
  const { input = 1e6, output = 1e6, limit = 1, ...filters } = options;
  return listModels(filters)
    .map((m) => {
      const c = calcCost(m.id, { input, output });
      return { ...m, cost: c ? c.total : Infinity };
    })
    .filter((m) => Number.isFinite(m.cost))
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))
    .slice(0, Math.max(limit, 0));
}

/** Distinct provider names present in the dataset. */
function listProviders() {
  return [...new Set(Object.values(models).map((m) => m.provider))].sort();
}

/** Resolve several ids at once; unknown ids are skipped. */
function compare(ids) {
  return (ids || []).map(getModel).filter(Boolean);
}

/**
 * Running total across many calls:
 *
 *   const spend = new CostTracker();
 *   spend.add("claude-opus-5", response.usage);
 *   spend.total; // USD
 */
class CostTracker {
  constructor() {
    this.calls = 0;
    this.total = 0;
    this.byModel = {};
  }

  /** Add one call. `usage` may be raw SDK usage or plain token counts. */
  add(id, usage, options) {
    const cost = calcCostFromUsage(id, usage, options);
    if (!cost) throw new Error(`Unknown model "${id}"`);
    const tokens = normalizeUsage(usage);
    const row =
      this.byModel[cost.id] ||
      (this.byModel[cost.id] = {
        id: cost.id,
        calls: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
      });
    row.calls += 1;
    row.input += tokens.input;
    row.output += tokens.output;
    row.cacheRead += tokens.cacheRead;
    row.cacheWrite += tokens.cacheWrite;
    row.cost += cost.total;
    this.calls += 1;
    this.total += cost.total;
    return cost;
  }

  /** Per-model rows, most expensive first. */
  rows() {
    return Object.values(this.byModel).sort((a, b) => b.cost - a.cost);
  }

  reset() {
    this.calls = 0;
    this.total = 0;
    this.byModel = {};
  }
}

module.exports = {
  models,
  updated,
  getModel,
  getPrice,
  calcCost,
  calcCostFromUsage,
  normalizeUsage,
  listModels,
  listProviders,
  cheapest,
  search,
  compare,
  CostTracker,
};
