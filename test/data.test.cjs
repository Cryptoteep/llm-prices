"use strict";

// Guards the shape of data/prices.json — these run in CI after every
// automated refresh, so a malformed upstream release cannot ship silently.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const data = require("../data/prices.json");

const entries = Object.entries(data.models);

test("header fields are sane", () => {
  assert.match(data.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(data.count, entries.length);
  assert.equal(data.unit, "USD per 1M tokens");
  assert.ok(data.source.startsWith("https://"));
});

test("ids are plain provider-native ids", () => {
  for (const [id, m] of entries) {
    // a slash is fine — Groq really does serve "openai/gpt-oss-120b" and
    // "meta-llama/llama-4-maverick". Its own name in front is not:
    // "mistral/mistral-large-latest" is a litellm-ism, not a Mistral id.
    const prefix = id.includes("/") ? id.slice(0, id.indexOf("/")) : null;
    assert.ok(prefix !== m.provider, `provider-prefixed id: ${id}`);
    assert.ok(!id.includes(":"), `fine-tune/ARN id: ${id}`);
    assert.ok(id.trim() === id && id.length > 0, `whitespace in id: ${id}`);
  }
});

test("every entry has usable prices and metadata", () => {
  for (const [id, m] of entries) {
    assert.equal(typeof m.provider, "string", `${id}: provider`);
    assert.equal(typeof m.input, "number", `${id}: input`);
    assert.equal(typeof m.output, "number", `${id}: output`);
    assert.ok(m.input >= 0 && m.input < 1000, `${id}: implausible input price ${m.input}`);
    assert.ok(m.output >= 0 && m.output < 5000, `${id}: implausible output price ${m.output}`);
    if (m.cacheRead != null) assert.ok(m.cacheRead <= m.input, `${id}: cacheRead > input`);
    if (m.context != null) assert.ok(m.context > 0, `${id}: context`);
    if (m.caps) assert.ok(Array.isArray(m.caps) && m.caps.length, `${id}: caps`);
    if (m.deprecated) assert.match(m.deprecated, /^\d{4}-\d{2}-\d{2}$/, `${id}: deprecated`);
  }
});

test("long-context tiers are complete and priced above base", () => {
  const tiered = entries.filter(([, m]) => m.longContext);
  assert.ok(tiered.length > 0, "expected tiered models in the dataset");
  for (const [id, m] of tiered) {
    const lc = m.longContext;
    assert.ok(lc.threshold >= 100_000, `${id}: threshold`);
    assert.equal(typeof lc.input, "number", `${id}: tier input`);
    assert.equal(typeof lc.output, "number", `${id}: tier output`);
    assert.ok(lc.input >= m.input, `${id}: tier input cheaper than base`);
  }
});

test("the providers the README advertises are all present", () => {
  const providers = new Set(entries.map(([, m]) => m.provider));
  for (const name of [
    "anthropic",
    "openai",
    "gemini",
    "deepseek",
    "mistral",
    "xai",
    "groq",
    "moonshot",
    "cohere",
    "perplexity",
  ]) {
    assert.ok(providers.has(name), `missing provider: ${name}`);
  }
});

test("flagship models resolve", () => {
  for (const id of ["claude-opus-5", "gpt-5.2", "deepseek-chat"]) {
    assert.ok(data.models[id], `missing well-known model: ${id}`);
  }
});
