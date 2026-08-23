"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const CLI = join(__dirname, "..", "bin", "cli.js");

function run(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status, out: e.stdout || "", err: e.stderr || "" };
  }
}

test("help and version", () => {
  const help = run([]);
  assert.equal(help.code, 0);
  assert.match(help.out, /llm-prices v\d+\.\d+\.\d+/);
  assert.match(run(["--version"]).out.trim(), /^\d+\.\d+\.\d+$/);
});

test("single model with a workload prints prices and a total", () => {
  const { code, out } = run(["claude-opus-5", "--in", "200k", "--out", "8k"]);
  assert.equal(code, 0);
  assert.match(out, /claude-opus-5\s+anthropic/);
  assert.match(out, /TOTAL/);
});

test("--json emits parseable output", () => {
  const { out } = run(["claude-opus-5", "--in", "1m", "--out", "100k", "--json"]);
  const parsed = JSON.parse(out);
  assert.equal(parsed.id, "claude-opus-5");
  assert.equal(parsed.usage.input, 1_000_000);
  assert.ok(parsed.cost.total > 0);

  const list = JSON.parse(run(["ls", "anthropic", "--json"]).out);
  assert.ok(Array.isArray(list) && list.length > 3);
  assert.ok(list.every((m) => m.provider === "anthropic"));
});

test("compare prices every model on the same workload", () => {
  const { code, out } = run([
    "compare",
    "claude-opus-5",
    "gpt-5.2",
    "--in",
    "200k",
    "--out",
    "8k",
  ]);
  assert.equal(code, 0);
  assert.match(out, /COST/);
  assert.match(out, /claude-opus-5/);
  assert.match(out, /gpt-5\.2/);
});

test("cheapest honours filters and --top", () => {
  const rows = JSON.parse(run(["cheapest", "--caps", "vision", "--top", "3", "--json"]).out);
  assert.equal(rows.length, 3);
  assert.ok(rows[0].cost <= rows[1].cost);
  assert.ok(rows.every((m) => m.caps.includes("vision")));
});

test("unknown model exits 1; ambiguous prefix lists candidates", () => {
  const unknown = run(["definitely-not-a-model"]);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /Unknown model/);

  const ambiguous = run(["claude"]);
  assert.equal(ambiguous.code, 1);
  assert.match(ambiguous.err, /matches \d+ models/);
});

test("invalid token counts are rejected", () => {
  const bad = run(["claude-opus-5", "--in", "lots"]);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /Invalid token count/);
});

test("providers lists provider names", () => {
  const { out } = run(["providers"]);
  assert.match(out, /anthropic/);
  assert.match(out, /openai/);
});
