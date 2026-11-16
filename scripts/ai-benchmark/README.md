# AI call benchmark

Compares the production analysis request with alternative configurations
(strict schema, shorter wording, less reasoning, other models) on a fixed set
of listings, and reports for each: valid responses, latency, tokens, cost,
automatic content checks and, optionally, a blind quality comparison against
the reference.

**It makes real, billed model calls.** Nothing runs unless `BENCH_FIXTURES`
is set, and spending stops at `BENCH_MAX_USD` (default 1 USD; the worst case
of every in-flight call is reserved before it starts, so the cap cannot be
overshot).

**It spends from the same API account as production** when it uses the key
in `.env.local`. On a prepaid account, a run that empties the balance stops
production analyses too (the API then answers 400 "credit balance is too
low"). Check the balance before a run, or run with a separate key
(`ANTHROPIC_API_KEY=… npm run bench:ai`).

## Files

| File | Role |
|---|---|
| `variants.ts` | The configurations compared, and list prices per model. |
| `run.ts` | The runner. Builds every request with `buildAnalysisRequest` from `src/lib/ai.ts`, so a variant is always "the production request with exactly this difference". |
| `checks.ts` | Deterministic checks on an output: schema, photo references that exist, title length, wording the prompt forbids, `tu`/`vous`, size of each section. |
| `judge.ts` | Blind pairwise judge (reference vs candidate, random order) scoring accuracy, absence of invention, relevance, photo-reference precision and completeness. |
| `economics.ts` | Cost and margin formulas. Every business input is a parameter. |
| `benchmark.test.ts` | Unit tests of the above (part of `npm test`, no model call). |

## Fixtures

A folder with a `manifest.json`:

```json
{
  "fixtures": [
    {
      "id": "link-1",
      "profile": "lien_bonne_annonce",
      "listing_url": "https://www.airbnb.fr/rooms/…"
    },
    {
      "id": "shots-1",
      "profile": "captures_photos_insuffisantes",
      "images": ["images/shots-1/0.jpg"],
      "input": { "city": "Lyon", "property_type": null, "guest_capacity": "4", "nightly_price": null }
    }
  ]
}
```

- `listing_url` without `images`: the listing is imported exactly as the app
  does (same extractor, same photo limit). The result is saved in
  `.frozen/<id>.json` and reused by later runs, so two runs compare the same
  photos and text even if the listing changes.
- `images`: paths relative to the fixtures folder, in listing order.
- Optional `extracted` (`title`, `description`, `bedroomCount`, `bedCount`,
  `bathroomCount`) simulates a link import without fetching the page.

Fixtures and results contain listing content. **Keep them outside the
repository**; only `report.md` (aggregates, no listing text) is meant to be
shared.

## Running

```bash
# Check the fixtures and freeze link imports. No model call.
BENCH_FIXTURES=/path/to/fixtures BENCH_FREEZE_ONLY=1 npm run bench:ai

# Run every variant on every fixture, at most 3 USD.
BENCH_FIXTURES=/path/to/fixtures BENCH_MAX_USD=3 npm run bench:ai

# Add the judge for two variants, reusing the generations already paid for.
BENCH_FIXTURES=/path/to/fixtures BENCH_REUSE=/path/to/results.json \
  BENCH_JUDGE=claude-opus-5-5 BENCH_JUDGE_VARIANTS=concise,no-thinking \
  BENCH_MAX_USD=2 npm run bench:ai
```

`ANTHROPIC_API_KEY` is read from `.env.local` (or the shell).

| Variable | Default | Meaning |
|---|---|---|
| `BENCH_FIXTURES` | — (required) | Folder containing `manifest.json`. |
| `BENCH_OUT` | `<fixtures>/results-<date>` | Where `results.json` and `report.md` are written. |
| `BENCH_MAX_USD` | `1` | Hard spending cap for the run. |
| `BENCH_VARIANTS` | all | Comma-separated variant ids. Keep `baseline`: it is the reference. |
| `BENCH_ONLY` | all | Comma-separated fixture ids. |
| `BENCH_REPEATS` | `1` | Passes over the whole grid. Latency varies between identical calls: use 3+ before trusting a small difference. |
| `BENCH_CONCURRENCY` | `3` | Parallel calls. |
| `BENCH_JUDGE` | `off` | Model id of the judge. |
| `BENCH_JUDGE_VARIANTS` | all | Variants to judge against the reference. |
| `BENCH_JUDGE_EFFORT` | `low` | Judge effort (`default` sends none). |
| `BENCH_REUSE` | — | A previous `results.json` whose successful generations are reused. |
| `BENCH_FREEZE_ONLY` | — | `1`: prepare fixtures and stop. |
| `BENCH_NET_RETRIES` | `2` | Extra attempts when a call is cut by the network (connection error or timeout only). A cut call may still be billed: its cost cannot be measured, so an upper estimate is counted against the cap and shown in the report. |
| `BENCH_STREAM` | on | `0` sends the blocking call production uses instead of a streamed one (same tokens and cost; a silent connection can be dropped by some networks on a call this long). |
| `BENCH_PRICES` | list prices in `variants.ts` | JSON `{ "<model>": { "input": n, "output": n } }`, USD per million tokens. |
| `BENCH_RETRY_RATE`, `BENCH_SUCCESS_RATE`, `BENCH_DUPLICATE_ATTEMPTS` | — | Measured rates from the Analytics dashboard, to turn cost per call into cost per successful analysis. |
| `BENCH_SALE` | — | JSON sale inputs for the margin table: `priceEur`, `paymentFeePercent`, `paymentFeeFixedEur`, `vatRate`, `usdToEur`, `analysesPerSale`. |

## Reading the results

- **"Réponses valides"** uses the production gate (`validateAiResponse`):
  a variant counts as working only if production would have accepted its
  response.
- **The automatic checks cannot tell whether a finding is true.** They catch
  format problems and references to things that do not exist. Truthfulness
  is what the judge estimates, and the judge is a model's opinion.
- **A few listings give an observation, not a statistically reliable
  conclusion.** Do not report a quality improvement from this benchmark
  unless the judge was run on enough listings to support it; "no measured
  degradation on N listings" is the strongest claim a small run supports.
- **Latency depends on the network the benchmark runs on.** Compare
  variants within one run only; the production figure is the server timing
  shown in the Analytics dashboard.
- A variant is adopted in production by changing `PRODUCTION_REQUEST_OPTIONS`
  in `src/lib/ai.ts` (and the test that pins it in `src/lib/ai.test.ts`).

## What was measured (November 2026)

Seven listings (five link imports, two screenshot imports), one pass each;
three of them for the variants other than the reference and Haiku 5.5.
Observations, not statistically reliable conclusions.

| Variant | Valid responses | Mean latency | Output tokens | Cost per call | Decision |
|---|---|---|---|---|---|
| Sonnet 5 (production) | 7/7 | 56 s | 5,167 | $0.081 | Kept. |
| Sonnet 5 + concision instruction | 3/3 | -7 % vs reference on the same listings | -7 % | -4 % | Not adopted: the gain is within call-to-call variation and its effect on quality was not judged. |
| Sonnet 5, effort low | 3/3 | no reliable gain | -13 % | -8 % | Not adopted: 3 suggested titles over the length limit. |
| Sonnet 5, thinking disabled | 2/3 | -1 % | +2 % | n/a | Not adopted: no gain, one response rejected by the production gate. |
| Sonnet 5.5 | 1/3 | n/a | +42 % | n/a | Not adopted in this configuration: two of three responses rejected. |
| Haiku 5.5 | 6/7 | 18 s (-67 %) | -24 % | $0.0034 (-96 %) | Not adopted: the blind judge preferred the reference on both pairs it scored (lower on all five criteria, more unsupported claims), and one response was rejected. |

Also established:

- The model reports no reasoning tokens on this request (forced tool
  call): the output tokens are the report itself, so latency can only come
  down with a shorter report or a faster model.
- `strict: true` on the full result schema is refused by the API ("compiled
  grammar is too large"). The `strict` variant is kept as evidence and is
  skipped unless named in `BENCH_VARIANTS`.
- Prompt caching and smaller images were not applied: at the current volume
  (a few analyses per day, more than five minutes apart) a cached prefix
  would almost never be read, and input tokens are about a third of the
  cost and a small part of the latency.
- The judge run stopped after two of seven pairs because the API account
  ran out of credit. Re-run it with `BENCH_REUSE` on the saved results to
  judge the remaining pairs without paying for the generations again.
