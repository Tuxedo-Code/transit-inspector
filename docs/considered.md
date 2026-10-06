# Considered and not built

Feature ideas that were evaluated and not built, with the reasons, so they aren't proposed again without new evidence. Each entry says what would change the verdict.

Evaluated on 2026-10-06 against the product's job (spec "Goal"): a reader that shows Transit traffic faithfully as EDN, observe only. A feature has to solve a pain that was actually hit, at least twice.

Accepted for later: "Watch a path across calls to one endpoint" (spec "Later").

## Size: does Transit save bandwidth?

Proposed: show what Transit's caching saves, as a size column in the request list with totals in a footer, compared to the same data as plain JSON. The aim was to judge whether Transit earns its keep, per endpoint and overall.

Method ([samples/measure-transit-size.ts](../samples/measure-transit-size.ts), deterministic, run with `node samples/measure-transit-size.ts`):

- Payloads: every readable Transit response in `samples/basic.har` (hand-made, small), plus synthetic order lists written with transit-js's own writer, so key caching applies as it does in a real app. Each order has namespaced keys, an enum keyword, a UUID, an instant, a nested customer map and a set of tags; lists of 10 to 10,000 orders.
- Each payload is compared with the same decoded value as JSON, the way a JSON API would send it: keywords as `"ns/name"` strings, sets and lists as arrays, UUIDs, instants and big numbers as strings, tagged values as their representation.
- Sizes in bytes, uncompressed, gzip and brotli (Node `zlib`, default levels).

Output, verbatim (Transit bytes / JSON bytes, negative means Transit is smaller):

```text
Bytes as Transit / JSON (Transit vs JSON). Node 24.21.0, transit-js 0.8.874, zlib default levels.

| Payload | Uncompressed | gzip | brotli |
|---|---|---|---|
| GET /api/users/42 | 1551 / 1585 (-2%) | 473 / 445 (+6%) | 396 / 357 (+11%) |
| POST /api/orders | 175 / 145 (+21%) | 127 / 122 (+4%) | 107 / 101 (+6%) |
| GET /api/feed | 257 / 285 (-10%) | 159 / 136 (+17%) | 143 / 113 (+27%) |
| GET /api/search | 323 / 235 (+37%) | 200 / 170 (+18%) | 161 / 133 (+21%) |
| GET /api/users/999 | 75 / 64 (+17%) | 80 / 76 (+5%) | 77 / 68 (+13%) |
| POST /api/payments | 94 / 81 (+16%) | 99 / 93 (+6%) | 86 / 71 (+21%) |
| POST /api/events | 19 / 12 (+58%) | 39 / 32 (+22%) | 23 / 16 (+44%) |
| Synthetic: 10 orders | 1984 / 2836 (-30%) | 469 / 422 (+11%) | 376 / 321 (+17%) |
| Synthetic: 100 orders | 18076 / 28438 (-36%) | 2063 / 2152 (-4%) | 1372 / 1393 (-2%) |
| Synthetic: 1000 orders | 178728 / 284190 (-37%) | 14828 / 16596 (-11%) | 7545 / 8039 (-6%) |
| Synthetic: 10000 orders | 1785260 / 2841722 (-37%) | 137921 / 159041 (-13%) | 57933 / 61085 (-5%) |

Skipped (not readable as Transit):
- GET /api/broken: Expected ',' or ']' after array element in JSON at position 24 (line 1 column 25)
```

(`/api/broken` is the sample HAR's deliberately malformed body.)

Outcome:

- Caching only pays before compression. Uncompressed, the order lists shrink by 30% to 37%. Small responses are larger as Transit even uncompressed (up to +58%), because of the `"~:"`, `"~u"` and `"^ "` prefixes.
- Servers compress responses, and compression removes the same repetition caching does. On the wire, Transit saves 4% to 13% with gzip and 2% to 6% with brotli on lists of 100 to 10,000 orders: about 21 kB of 159 kB with gzip and 3 kB of 61 kB with brotli for 10,000 orders. Small responses are 4% to 22% larger with gzip and 6% to 44% larger with brotli, a few dozen bytes each.
- So Transit brings no meaningful bandwidth benefit. Its benefit is EDN type preservation: keywords, sets, UUIDs, instants, big numbers and non-string map keys arrive intact.
- Not measured: whether the smaller uncompressed size makes parsing faster or uses less memory.
- Caveat: the large payloads are synthetic. Repeat the comparison on a HAR export from a real app before quoting numbers.

Verdict: no size column, totals footer or caching analysis. The result depends mostly on payload size, so a column would show small, unsurprising differences on every row.

Would change if: a real app shows large, endpoint-specific differences that someone would act on.

## Type correctness at the JS/JVM boundary

Proposed: show each value's wire type, flag whole numbers that the JVM will read as integers, and highlight non-JSON types, to catch floats that ClojureScript sent as integers.

- ClojureScript writes `200.0` as `200` because JavaScript has a single number type. The wire then carries exactly what the JVM reads, so nothing in the traffic says a float was intended. Only a schema at the boundary (malli coercion) knows the intent.
- Flagging every whole number marks almost every number in a payload.
- Non-JSON types are already visible in the EDN syntax: `1.5M`, `1N`, `#uuid`, `#inst`, keywords.

Verdict: rejected. Would change if: the panel gains a source of intent, such as a schema.

## Faithful numbers

Found while evaluating the above: the EDN pane misreports some numbers the JVM wrote.

- `200.0`, `1.2345678E7` (Java's format for doubles of 10^7 and above), `-0.0` and `"~d200.0"` (a double used as a map key) print as integers.
- Integers above 2^53 sent as plain JSON numbers print already rounded.

The cause is that transit-js parses with `JSON.parse` before any handler sees a value, and it can't be given pre-parsed input. The known fix is our own Transit JSON decoder that keeps each number's text as sent, with transit-js kept as a dev dependency to test against.

Verdict: not planned. The raw pane already shows the number as sent, and replacing the core decoder is too much risk for a pain hit once. Would change if: it misleads again.

## OpenAPI conformance

Proposed: load an OpenAPI spec and mark response fields that don't match it.

- Feasible: JSON Schema validators that don't use `eval` exist. Ajv itself can't run, because MV3 extension pages never allow `unsafe-eval`.
- The OpenAPI in question comes from a custom generator, and validating responses on the server (malli) checks the same thing with full type precision, on every request.
- Costs: a validator dependency, a mapping from EDN to JSON for validation, and loading the spec file every session (the panel can't fetch it, and storing it would change the privacy promise).

Verdict: rejected. Would change if: the backend can't validate its own responses, for example a third-party API.

## Structural diffing

Proposed: diff the decoded EDN of two captures, or of a capture and pasted text.

- Copying both EDN bodies into any diff tool already works, and responses from one endpoint keep the same key order, so a text diff is clean.
- "What changed after my action" is better served by watching a path (spec "Later").

Verdict: rejected for now. Would change if: copying out to diff becomes a routine step.

## Endpoint inventory and cross-endpoint consistency

Proposed: list every endpoint with its response shape, and spot endpoints that disagree on conventions (dates as instants or strings, key naming).

These are rare, one-off audits. A script over a HAR export answers them better than a live panel.

Verdict: rejected.
