# Changelog

## 1.1.0

**Data**

- 350 models, up from 146. Mistral, xAI (Grok), Groq, Moonshot, Cohere and
  Perplexity were advertised but missing: their upstream ids are
  provider-prefixed (`mistral/mistral-large-latest`) and the old filter dropped
  every id containing a slash. Ids are now normalized to the provider-native
  form the APIs actually accept.
- Each entry can carry `caps` (`vision`, `tools`, `cache`, `reasoning`, `pdf`,
  `audio`), a `deprecated` retirement date, and `longContext` surcharge rates.
- Weekly scheduled refresh from upstream: when prices move and the tests pass, a
  patch release publishes automatically.

**Library**

- `calcCost` applies long-context pricing by prompt size and reports which rate
  table it used (`tier: "base" | "long"`).
- `calcCostFromUsage(id, usage)` / `normalizeUsage(usage)` — cost straight from an
  Anthropic, OpenAI (chat or responses) or Google SDK `usage` object, with cached
  tokens counted the way each provider counts them.
- `CostTracker` — running spend across many calls, with per-model rows.
- `cheapest({ input, output, limit, ...filters })` — models ranked by cost for a
  workload.
- `search(query)` — every id matching a query, best match first.
- `listModels` takes `caps`, `minContext` and `includeDeprecated` filters and hides
  retired models by default.

**CLI**

- `compare` prices every model on the same workload (`--in` / `--out`).
- `cheapest` command with `--provider`, `--min-ctx`, `--caps`, `--top`.
- `--json` on every command, `--version`, capability column, right-aligned numbers.
- Ambiguous lookups list the candidates instead of just failing.

## 1.0.1

- CI cost-report recipe in the README.

## 1.0.0

- Initial release: pricing lookup, cost calculator, CLI, TypeScript types.
