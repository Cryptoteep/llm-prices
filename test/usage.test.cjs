"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getPrice,
  calcCost,
  calcCostFromUsage,
  normalizeUsage,
  CostTracker,
} = require("../index.cjs");

test("normalizeUsage: Anthropic shape keeps input and cache separate", () => {
  const u = normalizeUsage({
    input_tokens: 1_000,
    output_tokens: 500,
    cache_read_input_tokens: 200_000,
    cache_creation_input_tokens: 10_000,
  });
  assert.deepEqual(u, { input: 1_000, output: 500, cacheRead: 200_000, cacheWrite: 10_000 });
});

test("normalizeUsage: OpenAI chat subtracts cached tokens from the prompt", () => {
  const u = normalizeUsage({
    prompt_tokens: 100_000,
    completion_tokens: 2_000,
    prompt_tokens_details: { cached_tokens: 80_000 },
  });
  assert.deepEqual(u, { input: 20_000, output: 2_000, cacheRead: 80_000, cacheWrite: 0 });
});

test("normalizeUsage: OpenAI responses shape", () => {
  const u = normalizeUsage({
    input_tokens: 50_000,
    output_tokens: 1_000,
    input_tokens_details: { cached_tokens: 40_000 },
  });
  assert.deepEqual(u, { input: 10_000, output: 1_000, cacheRead: 40_000, cacheWrite: 0 });
});

test("normalizeUsage: Google shape", () => {
  const u = normalizeUsage({
    promptTokenCount: 30_000,
    candidatesTokenCount: 800,
    cachedContentTokenCount: 25_000,
  });
  assert.deepEqual(u, { input: 5_000, output: 800, cacheRead: 25_000, cacheWrite: 0 });
});

test("normalizeUsage: plain counts pass through, junk yields zeros", () => {
  assert.deepEqual(normalizeUsage({ input: 5, output: 6 }), {
    input: 5,
    output: 6,
    cacheRead: 0,
    cacheWrite: 0,
  });
  assert.deepEqual(normalizeUsage(null), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  assert.deepEqual(normalizeUsage("nope"), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
});

test("calcCostFromUsage matches calcCost on normalized counts", () => {
  const raw = {
    prompt_tokens: 100_000,
    completion_tokens: 2_000,
    prompt_tokens_details: { cached_tokens: 80_000 },
  };
  const fromRaw = calcCostFromUsage("gpt-5.2", raw);
  const fromCounts = calcCost("gpt-5.2", normalizeUsage(raw));
  assert.deepEqual(fromRaw, fromCounts);

  const p = getPrice("gpt-5.2");
  assert.equal(fromRaw.input, (20_000 / 1e6) * p.input);
  assert.equal(fromRaw.cacheRead, (80_000 / 1e6) * p.cacheRead);
});

test("CostTracker accumulates per model and in total", () => {
  const spend = new CostTracker();
  const a = spend.add("claude-opus-5", { input_tokens: 1_000_000, output_tokens: 0 });
  const b = spend.add("claude-opus-5", { input_tokens: 1_000_000, output_tokens: 0 });
  const c = spend.add("gpt-5.2", { prompt_tokens: 1_000_000, completion_tokens: 0 });

  assert.equal(spend.calls, 3);
  assert.equal(spend.total, a.total + b.total + c.total);
  assert.equal(spend.byModel["claude-opus-5"].calls, 2);
  assert.equal(spend.byModel["claude-opus-5"].input, 2_000_000);

  const rows = spend.rows();
  assert.equal(rows.length, 2);
  assert.ok(rows[0].cost >= rows[1].cost);

  spend.reset();
  assert.equal(spend.total, 0);
  assert.equal(spend.calls, 0);
  assert.deepEqual(spend.rows(), []);
});

test("CostTracker rejects unknown models", () => {
  const spend = new CostTracker();
  assert.throws(() => spend.add("no-such-model-xyz", { input: 1 }), /Unknown model/);
});
