#!/usr/bin/env node
"use strict";

const {
  getModel,
  calcCost,
  listModels,
  listProviders,
  cheapest,
  search,
  compare,
  updated,
} = require("../index.cjs");

const { version } = require("../package.json");
const argv = process.argv.slice(2);

// ---------------------------------------------------------------- arg parsing

const FLAGS_WITH_VALUE = new Set([
  "--in",
  "--input",
  "--out",
  "--output",
  "--cache-read",
  "--cache-write",
  "--provider",
  "--min-ctx",
  "--caps",
  "--top",
]);

const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("-")) {
    positional.push(a);
  } else if (FLAGS_WITH_VALUE.has(a)) {
    flags[a] = argv[++i];
  } else {
    flags[a] = true;
  }
}

const asJson = !!flags["--json"];

function parseTokens(s) {
  if (s == null) return 0;
  const m = String(s).trim().toLowerCase().match(/^([\d.]+)\s*([km]?)$/);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] === "m" ? n * 1e6 : m[2] === "k" ? n * 1e3 : n;
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// ------------------------------------------------------------------ rendering

const money = (v) => {
  if (v == null) return "—";
  if (v === 0) return "$0";
  if (v < 0.0001) return "<$0.0001";
  return v >= 100 ? `$${v.toFixed(2)}` : `$${+v.toFixed(4)}`;
};

const num = (v) =>
  v == null
    ? "—"
    : v >= 1e6
      ? `${Math.round((v / 1e6) * 10) / 10}M`
      : v >= 1e3
        ? `${Math.round(v / 1e3)}K`
        : String(v);

function table(rows, headers, align = []) {
  const all = [headers, ...rows];
  const widths = headers.map((_, i) =>
    Math.max(...all.map((r) => String(r[i] ?? "").length))
  );
  const line = (r) =>
    r
      .map((c, i) => {
        const s = String(c ?? "");
        return align[i] === "r" ? s.padStart(widths[i]) : s.padEnd(widths[i]);
      })
      .join("  ")
      .trimEnd();
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

function modelRow(m) {
  return [
    m.id,
    m.provider,
    money(m.input),
    money(m.output),
    m.cacheRead != null ? money(m.cacheRead) : "—",
    num(m.context),
    (m.caps || []).join(","),
  ];
}

const MODEL_HEADERS = ["MODEL", "PROVIDER", "IN/1M", "OUT/1M", "CACHE-RD", "CTX", "CAPS"];
const MODEL_ALIGN = ["l", "l", "r", "r", "r", "r", "l"];

function printModels(list, workload) {
  if (asJson) return console.log(JSON.stringify(list, null, 2));
  if (!workload) return table(list.map(modelRow), MODEL_HEADERS, MODEL_ALIGN);

  // priced against a shared workload: drop CAPS, add the cost column
  let anyLong = false;
  const rows = list.map((m) => {
    const cost = calcCost(m.id, workload);
    if (cost.tier === "long") anyLong = true;
    return [
      ...modelRow(m).slice(0, 6),
      money(cost.total) + (cost.tier === "long" ? " *" : ""),
    ];
  });
  table(
    rows,
    [...MODEL_HEADERS.slice(0, 6), "COST"],
    [...MODEL_ALIGN.slice(0, 6), "r"]
  );
  if (anyLong) console.log("\n* long-context pricing applied for this prompt size");
}

function suggest(query) {
  const hits = search(query);
  if (hits.length > 1) {
    return `"${query}" matches ${hits.length} models: ${hits.slice(0, 6).join(", ")}${
      hits.length > 6 ? ", …" : ""
    }`;
  }
  return `Unknown model "${query}". Try: llm-prices ls`;
}

function help() {
  console.log(`llm-prices v${version} — LLM pricing reference & cost calculator (data: ${updated})

Usage:
  llm-prices <model>                     show pricing for a model
  llm-prices <model> --in 100k --out 5k  calculate request cost
        [--cache-read 50k] [--cache-write 10k]
  llm-prices ls [provider]               list models
  llm-prices compare <m1> <m2> [...]     compare models side by side
        [--in 200k --out 8k]             ...priced on the same workload
  llm-prices cheapest [--in 1m --out 1m] rank models by cost for a workload
  llm-prices providers                   list providers

Filters (ls, cheapest):
  --provider <name>    only this provider
  --min-ctx <tokens>   context window at least this big
  --caps a,b           required capabilities: vision, tools, cache, reasoning, pdf, audio
  --all                include models past their retirement date
  --top <n>            how many rows (cheapest, default 10)

Other:
  --json               machine-readable output
  --version, --help

Token counts accept k/m suffixes: 500, 100k, 1.5m
Prices with a long-context surcharge (Gemini, Grok, GPT-5) switch tiers automatically.

Examples:
  npx llm-prices claude-opus-5 --in 200k --out 8k
  npx llm-prices compare claude-opus-5 gpt-5.2 gemini-3.1-pro --in 200k --out 8k
  npx llm-prices cheapest --caps vision,tools --min-ctx 200k
  npx llm-prices ls anthropic --json`);
}

// -------------------------------------------------------------------- filters

function filterOptions() {
  const opts = {};
  if (flags["--provider"]) opts.provider = flags["--provider"];
  if (flags["--min-ctx"]) {
    const ctx = parseTokens(flags["--min-ctx"]);
    if (Number.isNaN(ctx)) die("Invalid --min-ctx. Use e.g. 200k, 1m.");
    opts.minContext = ctx;
  }
  if (flags["--caps"]) opts.caps = String(flags["--caps"]).split(/[,\s]+/).filter(Boolean);
  if (flags["--all"]) opts.includeDeprecated = true;
  return opts;
}

function workloadOptions() {
  const usage = {
    input: parseTokens(flags["--in"] ?? flags["--input"]),
    output: parseTokens(flags["--out"] ?? flags["--output"]),
    cacheRead: parseTokens(flags["--cache-read"]),
    cacheWrite: parseTokens(flags["--cache-write"]),
  };
  if (Object.values(usage).some(Number.isNaN)) {
    die("Invalid token count. Use numbers with optional k/m suffix: 500, 100k, 1.5m");
  }
  return usage;
}

// -------------------------------------------------------------------- command

const cmd = positional[0];

if (flags["--version"] || flags["-v"] || cmd === "version") {
  console.log(version);
  process.exit(0);
}

if (!cmd || flags["--help"] || flags["-h"] || cmd === "help") {
  help();
  process.exit(0);
}

if (cmd === "providers") {
  const list = listProviders();
  console.log(asJson ? JSON.stringify(list) : list.join("\n"));
  process.exit(0);
}

if (cmd === "ls" || cmd === "list") {
  const opts = filterOptions();
  if (positional[1]) opts.provider = positional[1];
  const list = listModels(opts);
  if (!list.length) {
    die(
      opts.provider
        ? `No models for provider "${opts.provider}". Try: llm-prices providers`
        : "No models match those filters."
    );
  }
  printModels(list);
  process.exit(0);
}

if (cmd === "cheapest") {
  const usage = workloadOptions();
  const workload = {
    input: usage.input || 1e6,
    output: usage.output || 1e6,
  };
  const list = cheapest({
    ...filterOptions(),
    ...workload,
    limit: flags["--top"] ? Number(flags["--top"]) : 10,
  });
  if (!list.length) die("No models match those filters.");
  printModels(list, workload);
  process.exit(0);
}

if (cmd === "compare") {
  const ids = positional.slice(1);
  const list = compare(ids);
  if (!list.length) die("No matching models found.");
  const missing = ids.filter((id) => !getModel(id));
  const usage = workloadOptions();
  const priced = usage.input || usage.output || usage.cacheRead || usage.cacheWrite;
  printModels(list, priced ? usage : null);
  if (missing.length && !asJson) {
    console.error(`\nSkipped: ${missing.map(suggest).join("\n         ")}`);
  }
  process.exit(0);
}

// <model> [--in N] [--out N] [--cache-read N] [--cache-write N]
const model = getModel(cmd);
if (!model) die(suggest(cmd));

const usage = workloadOptions();
const priced = usage.input || usage.output || usage.cacheRead || usage.cacheWrite;

if (asJson) {
  const cost = priced ? calcCost(model.id, usage) : null;
  console.log(JSON.stringify(cost ? { ...model, usage, cost } : model, null, 2));
  process.exit(0);
}

printModels([model]);

if (priced) {
  const cost = calcCost(model.id, usage);
  console.log("");
  table(
    [
      ["input", num(usage.input || 0), money(cost.input)],
      ["output", num(usage.output || 0), money(cost.output)],
      ...(usage.cacheRead ? [["cache read", num(usage.cacheRead), money(cost.cacheRead)]] : []),
      ...(usage.cacheWrite
        ? [["cache write", num(usage.cacheWrite), money(cost.cacheWrite)]]
        : []),
      ["TOTAL", "", money(cost.total)],
    ],
    ["USAGE", "TOKENS", "COST"],
    ["l", "r", "r"]
  );
  if (cost.tier === "long") {
    console.log(
      `\nLong-context pricing applied (prompt over ${num(model.longContext.threshold)} tokens).`
    );
  }
}
