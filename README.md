# llm-prices

[![npm version](https://img.shields.io/npm/v/llm-prices.svg)](https://www.npmjs.com/package/llm-prices)
[![npm downloads](https://img.shields.io/npm/dm/llm-prices.svg)](https://www.npmjs.com/package/llm-prices)
[![license](https://img.shields.io/npm/l/llm-prices.svg)](./LICENSE)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/llm-prices)

**Up-to-date LLM pricing reference and cost calculator.** Claude, GPT, Gemini, DeepSeek, Mistral, Grok — input/output/cache prices per 1M tokens, context windows, and a cost calculator. Zero dependencies, works as a library and as a CLI.

Prices are regenerated from [LiteLLM's canonical pricing dataset](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) — the same source used across the industry.

## Quick start (CLI, no install)

```bash
npx llm-prices claude-opus-4-8 --in 200k --out 8k
```

```
MODEL            PROVIDER   IN/1M  OUT/1M  CACHE-RD  CTX
---------------  ---------  -----  ------  --------  ---
claude-opus-4-8  anthropic  $5     $25     $0.5      1M

USAGE   TOKENS  COST
------  ------  -----
input   200K    $1
output  8K      $0.2
TOTAL           $1.2
```

More commands:

```bash
npx llm-prices ls anthropic            # all Anthropic models
npx llm-prices ls                      # every model in the dataset
npx llm-prices compare claude-sonnet-5 gpt-5.2 gemini-3.1-pro-preview
npx llm-prices providers
```

Token counts accept `k`/`m` suffixes: `500`, `100k`, `1.5m`.

## Library

```bash
npm install llm-prices
```

```js
import { getPrice, calcCost, listModels } from "llm-prices";

getPrice("claude-opus-4-8");
// { id: 'claude-opus-4-8', input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }
// (USD per 1M tokens)

calcCost("gpt-5.2", { input: 120_000, output: 4_000 });
// { input: ..., output: ..., cacheRead: 0, cacheWrite: 0, total: ... }  (USD)

listModels({ provider: "anthropic" });
// [{ id, provider, input, output, cacheRead, cacheWrite, context, maxOutput }, ...]
```

CommonJS works too:

```js
const { calcCost } = require("llm-prices");
```

Fuzzy lookup: `getModel("fable")` resolves to `claude-fable-5` when the substring is unambiguous.

### Raw data

The whole dataset is a single small JSON you can import directly:

```js
import prices from "llm-prices/data" with { type: "json" };
```

## API

| Function | Returns |
|---|---|
| `getModel(id)` | Full entry: prices, cache prices, context window, max output |
| `getPrice(id)` | `{ input, output, cacheRead, cacheWrite }` in USD per 1M tokens |
| `calcCost(id, { input, output, cacheRead, cacheWrite })` | Cost breakdown + `total` in USD for given token counts |
| `listModels({ provider? })` | All entries, optionally filtered |
| `listProviders()` | Provider names in the dataset |
| `compare(ids)` | Entries for several models at once |
| `updated` | ISO date the data was last regenerated |

TypeScript definitions included.

## Keeping prices fresh

The dataset ships inside the package and is refreshed with regular releases. To regenerate locally from the live source:

```bash
npm run update-prices
```

If you spot a stale price, [open an issue](https://github.com/Cryptoteep/llm-prices/issues) — updates ship fast.

## Why not parse provider docs or LiteLLM's 1.6 MB JSON yourself?

- **Small**: the curated dataset is ~30 KB vs 1.6 MB upstream.
- **Zero dependencies**: nothing but Node ≥ 18.
- **Both worlds**: one package for scripts (`npx`), backends (`import`), and dashboards (raw JSON).

## License

MIT © [Cryptoteep](https://github.com/Cryptoteep)
