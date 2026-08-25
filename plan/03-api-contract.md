# API Contract

This is the contract both `backend-only/` and `fullstack/` must implement identically  -
same route, same schema, same status codes. A consumer should not be able to tell which
implementation they're hitting from the response shape.

## Endpoint

```
POST /api/allocations/weights
Content-Type: application/json
```

(`backend-only` may also serve this at `POST /allocations/weights`  -  final path fixed once
the Fastify plugin structure is scaffolded; documented in that folder's own README once
built.)

### Request body

```json
[
  { "userId": "user_1", "targetId": "A", "amount": 10000 },
  { "userId": "user_2", "targetId": "B", "amount": 50 }
]
```

| Field | Type | Constraints |
|---|---|---|
| `userId` | `string` | required, non-empty after trim |
| `targetId` | `string` | required, non-empty after trim |
| `amount` | `number` | required, finite, `>= 0`, `<= MAX_AMOUNT` (`1e12`) |

The request array itself is capped at `MAX_ALLOCATIONS` (`10,000`) rows. Both bounds exist so
a request can't push the aggregate sum toward IEEE-754 precision loss / `Infinity`, or force
unbounded server-side memory use (edge cases #9, #14).

### Success response  -  `200 OK`

```json
[
  { "targetId": "A", "rawTotal": 10000, "uniqueUserCount": 1, "weight": 10000 },
  { "targetId": "B", "rawTotal": 10000, "uniqueUserCount": 100, "weight": 1000000 }
]
```

- Array order: descending by `weight` (most-supported target first)  -  an explicit,
  documented choice so consumers don't have to re-sort, and so the "distributed beats
  concentrated" result is visible at a glance without reading numbers.
- Empty input `[]` → `200` with body `[]` (see edge case #7).

### Error response  -  `400 Bad Request`

```json
{
  "error": "ValidationError",
  "message": "amount must be a non-negative finite number",
  "details": [
    { "index": 2, "field": "amount", "value": -50 }
  ]
}
```

Returned for: non-array body, missing/empty `userId`/`targetId`, non-numeric/negative/
infinite/over-the-cap `amount`, or a request array longer than `MAX_ALLOCATIONS` (edge cases
#4, #5, #6, #9, #13, #14). The whole request is rejected atomically  -  no partial processing of
a batch with one bad row, so a caller can't end up with a silently incomplete result.

### Error response  -  other client errors

All client errors share the `{ "error": "<Name>", "message": "..." }` shape:

- `400 BadRequest`  -  body is not valid JSON, is empty, or is otherwise unparseable
  (distinct from `ValidationError`, which means the JSON parsed but the rows failed
  validation). Never reported as a 500: a client mistake must not masquerade as a
  server fault.
- `429 TooManyRequests`  -  the per-client rate limit (100 requests/minute) was exceeded.
- `409 IdempotencyConflict`  -  fullstack only: an `Idempotency-Key` was reused with a
  different payload than it was first recorded with (same key + same payload is an
  idempotent `200`; see the fullstack README).

### Error response  -  `500 Internal Server Error`

Standard shape for unexpected failures:
```json
{ "error": "InternalError", "message": "Something went wrong" }
```

## Algorithm boundary (per implementation, not shared)

Within each implementation  -  independently, with no cross-folder dependency  -  the domain
logic is isolated behind one pure function:

```ts
computeWeights(allocations: Allocation[]): TargetWeight[]
```

The HTTP layer is only responsible for transport concerns (parsing, validation error
formatting, status codes); the math and grouping logic lives in its own module, own tests,
own file, inside that implementation's `src/`. `backend-only/` and `fullstack/` each write
this function themselves, following the identical pseudocode in
[02-algorithm-and-edge-cases.md §5](02-algorithm-and-edge-cases.md#5-pseudocode-language-agnostic-both-implementations-follow-this-exactly)  -
same spec, two independent implementations, verified by each folder's own copy of the test
suite in [06-testing-strategy.md](06-testing-strategy.md).
