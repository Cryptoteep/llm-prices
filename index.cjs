"use strict";

const data = require("./data/prices.json");

/** All model entries keyed by model id. */
const models = data.models;

/** ISO date (YYYY-MM-DD) the price data was last regenerated. */
const updated = data.updated;

/**
 * Resolve a model id to its entry. Matching order:
 * exact id → case-insensitive id → unique substring match.
 * Returns null when nothing (or more than one candidate) matches.
 */
function getModel(id) {
  if (!id || typeof id !== "string") return null;
  if (models[id]) return { id, ...models[id] };

  const lower = id.toLowerCase();
  for (const key of Object.keys(models)) {
    if (key.toLowerCase() === lower) return { id: key, ...models[key] };
  }

  const candidates = Object.keys(models).filter((k) =>
    k.toLowerCase().includes(lower)
  );
  if (candidates.length === 1) {
    const key = candidates[0];
    return { id: key, ...models[key] };
  }
  return null;
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

/**
 * Cost in USD for the given token usage.
 * usage: { input, output, cacheRead, cacheWrite } — token counts.
 * Returns { id, input, output, cacheRead, cacheWrite, total } in USD, or null.
 */
function calcCost(id, usage = {}) {
  const m = getModel(id);
  if (!m) return null;
  const part = (tokens, pricePerM) =>
    tokens && pricePerM != null ? (tokens / 1e6) * pricePerM : 0;
  const input = part(usage.input, m.input);
  const output = part(usage.output, m.output);
  const cacheRead = part(usage.cacheRead, m.cacheRead);
  const cacheWrite = part(usage.cacheWrite, m.cacheWrite);
  return {
    id: m.id,
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  };
}

/**
 * List model entries. options: { provider } to filter.
 * Returns array of { id, ...entry } sorted by provider, then id.
 */
function listModels(options = {}) {
  let entries = Object.entries(models).map(([id, m]) => ({ id, ...m }));
  if (options.provider) {
    const p = String(options.provider).toLowerCase();
    entries = entries.filter((m) => m.provider === p);
  }
  return entries.sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id)
  );
}

/** Distinct provider names present in the dataset. */
function listProviders() {
  return [...new Set(Object.values(models).map((m) => m.provider))].sort();
}

/** Resolve several ids at once; unknown ids are skipped. */
function compare(ids) {
  return (ids || []).map(getModel).filter(Boolean);
}

module.exports = {
  models,
  updated,
  getModel,
  getPrice,
  calcCost,
  listModels,
  listProviders,
  compare,
};
