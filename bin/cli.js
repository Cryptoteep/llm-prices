#!/usr/bin/env node
"use strict";

const {
  getModel,
  calcCost,
  listModels,
  listProviders,
  compare,
  updated,
} = require("../index.cjs");

const args = process.argv.slice(2);

function parseTokens(s) {
  if (s == null) return 0;
  const m = String(s).trim().toLowerCase().match(/^([\d.]+)\s*([km]?)$/);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] === "m" ? n * 1e6 : m[2] === "k" ? n * 1e3 : n;
}

const money = (v) =>
  v == null ? "—" : v >= 100 ? `$${v.toFixed(2)}` : `$${+v.toFixed(4)}`;
const num = (v) =>
  v == null
    ? "—"
    : v >= 1e6
      ? `${Math.round((v / 1e6) * 10) / 10}M`
      : v >= 1e3
        ? `${Math.round(v / 1e3)}K`
        : String(v);

function table(rows, headers) {
  const all = [headers, ...rows];
  const widths = headers.map((_, i) =>
    Math.max(...all.map((r) => String(r[i]).length))
  );
  const line = (r) =>
    r.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

function printModels(list) {
  table(
    list.map((m) => [
      m.id,
      m.provider,
      money(m.input),
      money(m.output),
      m.cacheRead != null ? money(m.cacheRead) : "—",
      num(m.context),
    ]),
    ["MODEL", "PROVIDER", "IN/1M", "OUT/1M", "CACHE-RD", "CTX"]
  );
}

function help() {
  console.log(`llm-prices — LLM pricing reference & cost calculator (data: ${updated})

Usage:
  llm-prices <model>                     show pricing for a model
  llm-prices <model> --in 100k --out 5k  calculate request cost
        [--cache-read 50k] [--cache-write 10k]
  llm-prices ls [provider]               list models (all or one provider)
  llm-prices providers                   list providers
  llm-prices compare <m1> <m2> [...]     compare models side by side

Token counts accept k/m suffixes: 500, 100k, 1.5m

Examples:
  npx llm-prices claude-opus-4-8 --in 200k --out 8k
  npx llm-prices ls anthropic
  npx llm-prices compare claude-sonnet-5 gpt-5.2 gemini-3.1-pro-preview`);
}

const cmd = args[0];

if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
  help();
  process.exit(0);
}

if (cmd === "providers") {
  console.log(listProviders().join("\n"));
  process.exit(0);
}

if (cmd === "ls" || cmd === "list") {
  const list = listModels(args[1] ? { provider: args[1] } : {});
  if (!list.length) {
    console.error(`No models for provider "${args[1]}". Try: llm-prices providers`);
    process.exit(1);
  }
  printModels(list);
  process.exit(0);
}

if (cmd === "compare") {
  const list = compare(args.slice(1));
  if (!list.length) {
    console.error("No matching models found.");
    process.exit(1);
  }
  printModels(list);
  process.exit(0);
}

// <model> [--in N] [--out N] [--cache-read N] [--cache-write N]
const model = getModel(cmd);
if (!model) {
  console.error(`Unknown model "${cmd}". Try: llm-prices ls`);
  process.exit(1);
}

const flags = {};
for (let i = 1; i < args.length; i += 2) flags[args[i]] = args[i + 1];

const usage = {
  input: parseTokens(flags["--in"] ?? flags["--input"]),
  output: parseTokens(flags["--out"] ?? flags["--output"]),
  cacheRead: parseTokens(flags["--cache-read"]),
  cacheWrite: parseTokens(flags["--cache-write"]),
};

if (Object.values(usage).some(Number.isNaN)) {
  console.error("Invalid token count. Use numbers with optional k/m suffix: 500, 100k, 1.5m");
  process.exit(1);
}

printModels([model]);

if (usage.input || usage.output || usage.cacheRead || usage.cacheWrite) {
  const cost = calcCost(model.id, usage);
  console.log("");
  table(
    [
      ["input", num(usage.input || 0), money(cost.input)],
      ["output", num(usage.output || 0), money(cost.output)],
      ...(usage.cacheRead ? [["cache read", num(usage.cacheRead), money(cost.cacheRead)]] : []),
      ...(usage.cacheWrite ? [["cache write", num(usage.cacheWrite), money(cost.cacheWrite)]] : []),
      ["TOTAL", "", money(cost.total)],
    ],
    ["USAGE", "TOKENS", "COST"]
  );
}
