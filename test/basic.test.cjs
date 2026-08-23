"use strict";

// Assertions are written against the dataset's own values rather than
// hard-coded prices, so the weekly data refresh cannot break the suite.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  models,
  updated,
  getModel,
  getPrice,
  calcCost,
  listModels,
  listProviders,
  cheapest,
  search,
  compare,
} = require("../index.cjs");

test("dataset is non-empty and dated", () => {
  assert.ok(Object.keys(models).length > 200);
  assert.match(updated, /^\d{4}-\d{2}-\d{2}$/);
});

test("getModel: exact match", () => {
  const m = getModel("claude-opus-5");
  assert.ok(m);
  assert.equal(m.provider, "anthropic");
  assert.ok(m.input > 0 && m.output > 0);
  assert.ok(m.context >= 200_000);
});

test("getModel: case-insensitive and unique substring", () => {
  assert.ok(getModel("Claude-Opus-5"));
  assert.equal(getModel("fable").id, "claude-fable-5");
});

test("getModel: unknown or ambiguous returns null", () => {
  assert.equal(getModel("no-such-model-xyz"), null);
  assert.equal(getModel(""), null);
  assert.equal(getModel(null), null);
  assert.equal(getModel("claude"), null); // many candidates
});

test("search ranks the shortest match first and lists alternatives", () => {
  const hits = search("claude-opus");
  assert.ok(hits.length > 1);
  assert.ok(hits.every((id) => id.includes("claude-opus")));
  assert.deepEqual(search("gpt-5.2").slice(0, 1), ["gpt-5.2"]);
  assert.deepEqual(search("definitely-not-a-model"), []);
});

test("getPrice returns per-1M prices", () => {
  const p = getPrice("claude-haiku-4-5");
  assert.equal(p.id, "claude-haiku-4-5");
  assert.ok(p.output > p.input);
  assert.ok(p.cacheRead < p.input);
});

test("calcCost computes USD totals from the model's own rates", () => {
  const p = getPrice("claude-opus-5");
  const c = calcCost("claude-opus-5", { input: 1_000_000, output: 100_000 });
  assert.equal(c.input, p.input);
  assert.equal(c.output, p.output * 0.1);
  assert.equal(c.total, p.input + p.output * 0.1);
  assert.equal(c.tier, "base");
});

test("calcCost handles cache tokens, empty usage and unknown models", () => {
  assert.equal(calcCost("claude-opus-5", {}).total, 0);
  assert.ok(calcCost("claude-opus-5", { cacheRead: 1_000_000 }).cacheRead > 0);
  assert.equal(calcCost("no-such-model-xyz", { input: 10 }), null);
});

test("calcCost switches to long-context rates by prompt size", () => {
  const m = listModels({ includeDeprecated: true }).find((x) => x.longContext);
  assert.ok(m, "dataset should contain at least one tiered model");
  const over = m.longContext.threshold + 1000;

  const base = calcCost(m.id, { input: 1000, output: 1000 });
  const long = calcCost(m.id, { input: over, output: 1000 });
  assert.equal(base.tier, "base");
  assert.equal(long.tier, "long");
  assert.equal(long.input, (over / 1e6) * m.longContext.input);

  // explicit tiers override the prompt-size heuristic
  assert.equal(calcCost(m.id, { input: over, output: 0 }, { tier: "base" }).tier, "base");
  assert.equal(calcCost(m.id, { input: 10, output: 0 }, { tier: "long" }).tier, "long");
});

test("listModels filters by provider, caps and context", () => {
  const anthropic = listModels({ provider: "anthropic" });
  assert.ok(anthropic.length > 5);
  assert.ok(anthropic.every((m) => m.provider === "anthropic"));

  const vision = listModels({ caps: ["vision", "tools"] });
  assert.ok(vision.length > 5);
  assert.ok(vision.every((m) => m.caps.includes("vision") && m.caps.includes("tools")));

  const big = listModels({ minContext: 500_000 });
  assert.ok(big.every((m) => m.context >= 500_000));
});

test("listModels hides retired models unless asked", () => {
  const past = "2000-01-01";
  const retired = Object.entries(models).filter(([, m]) => m.deprecated && m.deprecated < past);
  const shown = listModels();
  const all = listModels({ includeDeprecated: true });
  assert.ok(all.length >= shown.length);
  for (const [id] of retired) assert.ok(!shown.some((m) => m.id === id));
});

test("listProviders includes the majors", () => {
  const p = listProviders();
  for (const name of ["anthropic", "openai", "gemini", "mistral", "xai", "deepseek"]) {
    assert.ok(p.includes(name), `missing provider ${name}`);
  }
});

test("cheapest ranks by workload cost", () => {
  const list = cheapest({ provider: "anthropic", limit: 3, input: 200_000, output: 8_000 });
  assert.equal(list.length, 3);
  assert.ok(list[0].cost <= list[1].cost && list[1].cost <= list[2].cost);
  assert.equal(
    list[0].cost,
    calcCost(list[0].id, { input: 200_000, output: 8_000 }).total
  );

  // output-heavy workloads can rank differently than input-heavy ones
  const heavyOut = cheapest({ limit: 5, input: 1_000, output: 1_000_000 });
  assert.ok(heavyOut.every((m) => Number.isFinite(m.cost)));
});

test("cheapest respects filters", () => {
  const list = cheapest({ caps: "vision", minContext: 200_000, limit: 5 });
  assert.ok(list.length > 0);
  assert.ok(list.every((m) => m.caps.includes("vision") && m.context >= 200_000));
});

test("compare skips unknown ids", () => {
  const list = compare(["claude-opus-5", "nope-123"]);
  assert.equal(list.length, 1);
  assert.equal(compare([]).length, 0);
  assert.equal(compare(null).length, 0);
});
