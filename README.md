# llm-prices

[![npm version](https://img.shields.io/npm/v/llm-prices.svg)](https://www.npmjs.com/package/llm-prices)
[![npm downloads](https://img.shields.io/npm/dm/llm-prices.svg)](https://www.npmjs.com/package/llm-prices)
[![CI](https://github.com/Cryptoteep/llm-prices/actions/workflows/ci.yml/badge.svg)](https://github.com/Cryptoteep/llm-prices/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/llm-prices.svg)](./LICENSE)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/llm-prices)

**Up-to-date LLM pricing reference and cost calculator.** 350+ models from Anthropic, OpenAI, Google, xAI, Mistral, DeepSeek, Groq, Moonshot, Cohere and Perplexity — input/output/cache prices per 1M tokens, context windows, capabilities, and long-context surcharge tiers. Zero dependencies, works as a library and as a CLI.

Prices are regenerated from [LiteLLM's canonical pricing dataset](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) — the same source used across the industry — and [refreshed automatically every week](.github/workflows/update-prices.yml).

## Quick start (CLI, no install)

```bash
npx llm-prices claude-opus-5 --in 200k --out 8k
```

```
MODEL          PROVIDER   IN/1M  OUT/1M  CACHE-RD  CTX  CAPS
-------------  ---------  -----  ------  --------  ---  --------------------------------
claude-opus-5  anthropic     $5     $25      $0.5   1M  vision,tools,cache,reasoning,pdf

USAGE   TOKENS  COST
------  ------  ----
input     200K    $1
output      8K  $0.2
TOTAL           $1.2
```

**Price one workload across models** — the number you actually want before picking one:

```bash
npx llm-prices compare claude-opus-5 gpt-5.2 gemini-2.5-pro --in 300k --out 8k
```

```
MODEL           PROVIDER   IN/1M  OUT/1M  CACHE-RD   CTX     COST
--------------  ---------  -----  ------  --------  ----  -------
claude-opus-5   anthropic     $5     $25      $0.5    1M     $1.7
gpt-5.2         openai     $1.75     $14    $0.175  272K   $0.637
gemini-2.5-pro  gemini     $1.25     $10    $0.125    1M  $0.87 *

* long-context pricing applied for this prompt size
```

**Or let it pick** — cheapest model that still meets your requirements:

```bash
npx llm-prices cheapest --caps vision,tools --min-ctx 200k --top 5
npx llm-prices ls anthropic
npx llm-prices providers
npx llm-prices ls --json | jq '.[] | select(.input < 1)'
```

Token counts accept `k`/`m` suffixes: `500`, `100k`, `1.5m`. Every command takes `--json`.

## Library

```bash
npm install llm-prices
```

```js
import { getPrice, calcCost, listModels } from "llm-prices";

getPrice("claude-opus-5");
// { id: 'claude-opus-5', input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }
// (USD per 1M tokens)

calcCost("gpt-5.2", { input: 120_000, output: 4_000 });
// { id, tier: 'base', input: ..., output: ..., cacheRead: 0, cacheWrite: 0, total: ... }

listModels({ provider: "anthropic", caps: ["vision", "cache"], minContext: 200_000 });
// [{ id, provider, input, output, cacheRead, cacheWrite, context, maxOutput, caps }, ...]
```

CommonJS works too:

```js
const { calcCost } = require("llm-prices");
```

Fuzzy lookup: `getModel("fable")` resolves to `claude-fable-5` when the substring is unambiguous; `search("claude-opus")` returns every candidate.

### Cost straight from an SDK response

Every provider reports usage differently — and two of them fold cached tokens
into the prompt count while Anthropic does not. `calcCostFromUsage` takes the raw
object and handles that for you:

```js
import { calcCostFromUsage } from "llm-prices";

const message = await anthropic.messages.create({ model: "claude-opus-5", ... });
calcCostFromUsage("claude-opus-5", message.usage).total; // USD

const completion = await openai.chat.completions.create({ model: "gpt-5.2", ... });
calcCostFromUsage("gpt-5.2", completion.usage).total;    // USD
```

Anthropic (`input_tokens` + `cache_read_input_tokens`), OpenAI chat
(`prompt_tokens` + `prompt_tokens_details.cached_tokens`), OpenAI responses
(`input_tokens_details`) and Google (`promptTokenCount` +
`cachedContentTokenCount`) shapes are all recognized.

### Track spend across a run

```js
import { CostTracker } from "llm-prices";

const spend = new CostTracker();
for (const doc of docs) {
  const res = await anthropic.messages.create({ model, ... });
  spend.add(model, res.usage);
  if (spend.total > 5) throw new Error(`budget blown: $${spend.total.toFixed(2)}`);
}

spend.total;   // 3.87
spend.calls;   // 42
spend.rows();  // per-model: calls, tokens, cost — most expensive first
```

### Long-context pricing is handled

Gemini, Grok and GPT-5-class models charge more once the prompt crosses a
threshold. `calcCost` switches rate tables by prompt size automatically, and
tells you which one it used:

```js
calcCost("gemini-2.5-pro", { input: 100_000, output: 5_000 }).tier; // 'base'
calcCost("gemini-2.5-pro", { input: 300_000, output: 5_000 }).tier; // 'long'
```

Force one with `calcCost(id, usage, { tier: "base" })`.

### Raw data

The whole dataset is a single small JSON you can import directly:

```js
import prices from "llm-prices/data" with { type: "json" };
```

## API

| Function | Returns |
|---|---|
| `getModel(id)` | Full entry: prices, cache prices, context window, max output, caps |
| `getPrice(id)` | `{ input, output, cacheRead, cacheWrite }` in USD per 1M tokens |
| `calcCost(id, usage, opts?)` | Cost breakdown + `total` in USD for given token counts |
| `calcCostFromUsage(id, usage, opts?)` | Same, from a raw provider SDK `usage` object |
| `normalizeUsage(usage)` | Provider `usage` object → `{ input, output, cacheRead, cacheWrite }` |
| `listModels({ provider?, caps?, minContext?, includeDeprecated? })` | Filtered entries |
| `cheapest({ input?, output?, limit?, ...filters })` | Models ranked by cost for a workload |
| `search(query)` | Model ids matching a query, best match first |
| `listProviders()` | Provider names in the dataset |
| `compare(ids)` | Entries for several models at once |
| `CostTracker` | Running spend: `add(id, usage)`, `total`, `calls`, `rows()` |
| `updated` | ISO date the data was last regenerated |

Capabilities (`caps`): `vision`, `tools`, `cache`, `reasoning`, `pdf`, `audio`.
Models past their announced retirement date are hidden unless you pass
`includeDeprecated: true` (`--all` on the CLI).

TypeScript definitions included.

## Use in CI

Print the cost of your test-suite's LLM calls on every pipeline run — no install step, `npx` fetches the CLI on the fly:

```yaml
# .github/workflows/llm-cost.yml
name: LLM cost report
on: [pull_request]

jobs:
  cost:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      # replace the token counts with your run's actuals
      - run: npx -y llm-prices claude-opus-5 --in 250k --out 12k >> "$GITHUB_STEP_SUMMARY"
```

Or budget-gate a script programmatically:

```js
import { calcCostFromUsage } from "llm-prices";

const cost = calcCostFromUsage(process.env.MODEL, response.usage);
if (cost.total > 5) throw new Error(`LLM budget exceeded: $${cost.total.toFixed(2)}`);
```

## Keeping prices fresh

A scheduled job regenerates the dataset from upstream every Monday; when prices
actually moved and the tests pass, a patch release ships automatically. To
regenerate locally:

```bash
npm run update-prices     # rewrite data/prices.json
npm run check-prices      # exit 1 if upstream moved (no write)
```

If you spot a stale price, [open an issue](https://github.com/Cryptoteep/llm-prices/issues) — updates ship fast.

## Why not parse provider docs or LiteLLM's 1.8 MB JSON yourself?

- **Small**: the curated dataset is ~95 KB vs 1.8 MB upstream (20 KB installed), with provider-native
  model ids (`mistral-large-latest`, not `mistral/mistral-large-latest`) and no
  fine-tune, ARN or re-hoster duplicates.
- **Zero dependencies**: nothing but Node ≥ 18.
- **Correct where it's easy to be wrong**: cached tokens counted the way each
  provider counts them, long-context tiers applied by prompt size.
- **Both worlds**: one package for scripts (`npx`), backends (`import`), and dashboards (raw JSON).

## License

MIT © [Cryptoteep](https://github.com/Cryptoteep)
