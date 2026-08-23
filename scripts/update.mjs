#!/usr/bin/env node
// Regenerates data/prices.json from LiteLLM's canonical pricing dataset.
//
// Usage:
//   node scripts/update.mjs [path-to-local-litellm-json]
//   node scripts/update.mjs --check    exit 1 if the regenerated data differs
//                                      (prices only — the `updated` stamp is ignored)

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

// litellm_provider -> normalized provider name.
// Only first-party providers: re-hosters (openrouter, together, fireworks,
// deepinfra, bedrock, azure...) mostly duplicate these models under longer ids.
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
  ["cohere_chat", "cohere"],
  ["perplexity", "perplexity"],
]);

const MODES = new Set(["chat", "responses"]);

// litellm ids are often provider-prefixed ("mistral/mistral-large-latest",
// and occasionally doubled: "perplexity/perplexity/..."). The bare id is what
// you pass to the provider's own API, so strip the entry's own prefix — and
// only its own: Groq really does serve "openai/gpt-oss-120b" and
// "meta-llama/llama-4-maverick", whose slashes are part of the id.
function stripPrefix(id, m) {
  const own = new Set([m.litellm_provider, PROVIDERS.get(m.litellm_provider)]);
  let out = id;
  for (let i = out.indexOf("/"); i !== -1; i = out.indexOf("/")) {
    if (!own.has(out.slice(0, i))) break;
    out = out.slice(i + 1);
  }
  return out;
}

const CAPS = [
  ["vision", "supports_vision"],
  ["tools", "supports_function_calling"],
  ["cache", "supports_prompt_caching"],
  ["reasoning", "supports_reasoning"],
  ["pdf", "supports_pdf_input"],
  ["audio", "supports_audio_input"],
];

// Long-context surcharge tiers used by Gemini / Grok / GPT-5-class models.
const TIER_THRESHOLDS = [128, 200, 256, 272, 512].map((k) => k * 1000);

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "data", "prices.json");

async function loadSource() {
  const localPath = process.argv.find((a) => !a.startsWith("--") && a.endsWith(".json"));
  if (localPath && existsSync(localPath)) return JSON.parse(readFileSync(localPath, "utf8"));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch source: ${res.status}`);
  return res.json();
}

const perMillion = (v) => (v == null ? null : Math.round(v * 1e6 * 1e4) / 1e4);

function longContext(m) {
  for (const t of TIER_THRESHOLDS) {
    const k = `_above_${t / 1000}k_tokens`;
    const input = m[`input_cost_per_token${k}`];
    const output = m[`output_cost_per_token${k}`];
    if (input == null && output == null) continue;
    return {
      threshold: t,
      input: perMillion(input ?? m.input_cost_per_token),
      output: perMillion(output ?? m.output_cost_per_token),
      cacheRead: perMillion(
        m[`cache_read_input_token_cost${k}`] ?? m.cache_read_input_token_cost
      ),
      cacheWrite: perMillion(
        m[`cache_creation_input_token_cost${k}`] ?? m.cache_creation_input_token_cost
      ),
    };
  }
  return null;
}

function entry(m) {
  const caps = CAPS.filter(([, field]) => m[field] === true).map(([name]) => name);
  const e = {
    provider: PROVIDERS.get(m.litellm_provider),
    input: perMillion(m.input_cost_per_token),
    output: perMillion(m.output_cost_per_token),
    cacheRead: perMillion(m.cache_read_input_token_cost),
    cacheWrite: perMillion(m.cache_creation_input_token_cost),
    context: m.max_input_tokens ?? null,
    maxOutput: m.max_output_tokens ?? null,
  };
  if (caps.length) e.caps = caps;
  const lc = longContext(m);
  if (lc) e.longContext = lc;
  if (m.deprecation_date) e.deprecated = m.deprecation_date;
  return e;
}

function usable(id, m) {
  if (!m || typeof m !== "object") return false;
  if (!MODES.has(m.mode)) return false;
  if (!PROVIDERS.has(m.litellm_provider)) return false;
  if (m.input_cost_per_token == null || m.output_cost_per_token == null) return false;
  if (id.includes(":") || id.includes(" ")) return false; // ft: / arn: duplicates
  if (/^together-ai-[\d.]+b/.test(id)) return false; // size buckets, not models
  return true;
}

const raw = await loadSource();
const models = {};

// Bare ids first so a canonical entry always wins over a prefixed duplicate.
const sources = Object.entries(raw).filter(([id, m]) => usable(id, m));
for (const pass of [0, 1]) {
  for (const [id, m] of sources) {
    const key = stripPrefix(id, m);
    const prefixed = key !== id;
    if ((pass === 0) === prefixed) continue;
    if (!key || models[key]) continue;
    models[key] = entry(m);
  }
}

const ordered = Object.fromEntries(Object.keys(models).sort().map((k) => [k, models[k]]));
const count = Object.keys(ordered).length;

// Guard the unattended weekly run: a malformed upstream must not wipe the dataset.
if (existsSync(outPath)) {
  const prev = JSON.parse(readFileSync(outPath, "utf8"));
  if (count < prev.count * 0.8) {
    console.error(
      `Refusing to write: ${count} models vs ${prev.count} previously. Source looks broken.`
    );
    process.exit(2);
  }
}

const out = {
  updated: new Date().toISOString().slice(0, 10),
  source: SOURCE_URL,
  unit: "USD per 1M tokens",
  count,
  models: ordered,
};

const serialized = JSON.stringify(out, null, 1) + "\n";

if (process.argv.includes("--check")) {
  const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
  const same =
    JSON.stringify(prev.models) === JSON.stringify(out.models) && prev.count === out.count;
  console.log(same ? "prices up to date" : `prices changed (${prev.count ?? 0} -> ${count} models)`);
  process.exit(same ? 0 : 1);
}

writeFileSync(outPath, serialized);
console.log(`Wrote ${count} models (updated ${out.updated})`);
