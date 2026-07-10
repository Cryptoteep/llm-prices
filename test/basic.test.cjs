"use strict";

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
  compare,
} = require("../index.cjs");

test("dataset is non-empty and dated", () => {
  assert.ok(Object.keys(models).length > 50);
  assert.match(updated, /^\d{4}-\d{2}-\d{2}$/);
});

test("getModel: exact match", () => {
  const m = getModel("claude-opus-4-8");
  assert.ok(m);
  assert.equal(m.provider, "anthropic");
  assert.equal(m.input, 5);
  assert.equal(m.output, 25);
});

test("getModel: case-insensitive and unique substring", () => {
  assert.ok(getModel("Claude-Opus-4-8"));
  assert.equal(getModel("fable").id, "claude-fable-5");
});

test("getModel: unknown returns null", () => {
  assert.equal(getModel("no-such-model-xyz"), null);
  assert.equal(getModel(""), null);
  assert.equal(getModel(null), null);
});

test("getPrice returns per-1M prices", () => {
  const p = getPrice("claude-haiku-4-5");
  assert.equal(p.input, 1);
  assert.equal(p.output, 5);
});

test("calcCost computes USD totals", () => {
  const c = calcCost("claude-opus-4-8", { input: 1_000_000, output: 100_000 });
  assert.equal(c.input, 5);
  assert.equal(c.output, 2.5);
  assert.equal(c.total, 7.5);
});

test("calcCost handles cache tokens and missing usage", () => {
  const c = calcCost("claude-opus-4-8", {});
  assert.equal(c.total, 0);
  const withCache = calcCost("claude-opus-4-8", { cacheRead: 1_000_000 });
  assert.ok(withCache.cacheRead > 0);
});

test("listModels filters by provider", () => {
  const anthropic = listModels({ provider: "anthropic" });
  assert.ok(anthropic.length > 5);
  assert.ok(anthropic.every((m) => m.provider === "anthropic"));
});

test("listProviders includes majors", () => {
  const p = listProviders();
  assert.ok(p.includes("anthropic"));
  assert.ok(p.includes("openai"));
});

test("compare skips unknown ids", () => {
  const list = compare(["claude-opus-4-8", "nope-123"]);
  assert.equal(list.length, 1);
});
