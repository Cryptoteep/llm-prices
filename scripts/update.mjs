#!/usr/bin/env node
// Regenerates data/prices.json from LiteLLM's canonical pricing dataset.
// Usage: node scripts/update.mjs [path-to-local-litellm-json]

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

// Map litellm_provider values to normalized provider names.
const PROVIDERS = new Map([
  ["anthropic", "anthropic"],
  ["openai", "openai"],
  ["gemini", "gemini"],
  ["vertex_ai-language-models", "gemini"],
  ["deepseek", "deepseek"],
  ["mistral", "mistral"],
  ["xai", "xai"],
  ["groq", "groq"],
  ["moonshot", "moonshot"],
]);

const here = dirname(fileURLToPath(import.meta.url));

async function loadSource() {
  const localPath = process.argv[2];
  if (localPath) return JSON.parse(readFileSync(localPath, "utf8"));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch source: ${res.status}`);
  return res.json();
}

const perMillion = (v) =>
  v == null ? null : Math.round(v * 1e6 * 1e4) / 1e4;

const raw = await loadSource();
const models = {};

for (const [id, m] of Object.entries(raw)) {
  if (id.includes("/") || id.includes(":")) continue; // provider-prefixed & ARN duplicates
  if (!m || typeof m !== "object") continue;
  if (m.mode !== "chat") continue;
  if (!PROVIDERS.has(m.litellm_provider)) continue;
  if (m.input_cost_per_token == null || m.output_cost_per_token == null) continue;
  if (models[id]) continue; // first entry wins

  models[id] = {
    provider: PROVIDERS.get(m.litellm_provider),
    input: perMillion(m.input_cost_per_token),
    output: perMillion(m.output_cost_per_token),
    cacheRead: perMillion(m.cache_read_input_token_cost),
    cacheWrite: perMillion(m.cache_creation_input_token_cost),
    context: m.max_input_tokens ?? null,
    maxOutput: m.max_output_tokens ?? null,
  };
}

const out = {
  updated: new Date().toISOString().slice(0, 10),
  source: SOURCE_URL,
  unit: "USD per 1M tokens",
  count: Object.keys(models).length,
  models,
};

writeFileSync(join(here, "..", "data", "prices.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote ${out.count} models (updated ${out.updated})`);
