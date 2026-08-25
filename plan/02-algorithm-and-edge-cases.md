# Algorithm Design & Edge Cases

## 1. The formula

For a single `targetId`:

```
Step 1 — group this target's allocations by userId, summing amounts:
    userTotal_u = Σ amount for all allocations where userId = u AND targetId = this target

Step 2 — take the square root of each user's total, then sum those roots:
    S = Σ over unique users u of sqrt(userTotal_u)

Step 3 — square the sum:
    weight = S²

Also reported (not derived from weight, computed directly):
    rawTotal        = Σ amount over ALL allocations for this target (before any dedup by user)
    uniqueUserCount = count of distinct userId contributing to this target
```

Step 1 exists specifically because the spec calls it out: *"A user might submit multiple
allocations to the same target."* Two $50 allocations from `user_1` to target `A` must count
as one $100 contribution from one person — not as if two different people each gave $50. If
you skip Step 1 and just `sqrt()` every raw allocation independently, a single user can farm
weight for free by splitting their own contribution into many small allocations (since
`sqrt(a) + sqrt(b) > sqrt(a+b)` for positive a, b). Grouping by user first closes that loophole
naturally — it's the same dampening principle applied recursively, and it's why Step 1 is
non-negotiable rather than a nice-to-have.

## 2. Why this formula, not another

Formulas considered, and why QF was chosen:

| Formula | `weight` | Ratio B:A (below) | Verdict |
|---|---|---|---|
| Raw sum (baseline / no dampening) | `Σ amount` | 1× (identical) | Rejected — this is the plutocracy the challenge explicitly asks to avoid. |
| Per-allocation sqrt, no user grouping | `Σ sqrt(amount_i)` per raw allocation | dampens, but exploitable (see Step 1 rationale above) | Rejected — fails the "handle relevant edge cases" bar. |
| Per-user sqrt, summed (not re-squared) | `Σ sqrt(userTotal_u)` | 10× | Valid, dampens correctly, but is a less standard construction and the resulting numbers no longer have a clean "funding pool" interpretation. |
| **Quadratic Funding: `(Σ sqrt(userTotal_u))²`** | as above | **100×** | **Chosen.** Well-established mechanism, correct incentive properties, and — as a bonus — the result is denominated in the same units as `rawTotal` (dollars-squared-then-rooted-back-to-dollars scale), which makes the two numbers meaningfully comparable in a UI. |
| Log dampening (`Σ log(1+amount_i)`) | — | ~50× | Valid alternative, more aggressive dampening for large single amounts, but arbitrary base choice with no principled justification for *why* log. Not used, documented here for completeness. |

## 3. Worked proof for the two required tests

**Test A — Concentrated:** 1 user, `user_1`, allocates $10,000 to target `A`.

```
userTotal_user_1 = 10000
S = sqrt(10000) = 100
weight_A = 100² = 10,000
```

**Test B — Distributed:** 100 unique users allocate $100 each to target `B` (raw total also $10,000).

```
each userTotal_u = 100 → sqrt(100) = 10
S = 100 users × 10 = 1000
weight_B = 1000² = 1,000,000
```

**Ratio:** `weight_B / weight_A = 1,000,000 / 10,000 = 100`. The spec requires ≥ 2×; this
formula clears it by 50×, which is the point — it should be *obvious* from the output, not a
narrow pass.

This ratio is also provable in general, not just for these two numbers. For `n` users each
contributing `amount/n` versus 1 user contributing `amount`:

```
weight_distributed = (n · sqrt(amount/n))² = n · amount
weight_concentrated = (sqrt(amount))² = amount

ratio = weight_distributed / weight_concentrated = n
```

So the dampening ratio scales *linearly with the number of distinct contributors*, for any
raw total held equal. This is what "clearly demonstrate distributed participation is more
valuable" means made concrete: it's not a fixed bonus, it's proportional to how broad the
consensus actually is.

## 4. Edge-case catalog

| # | Case | Decision | Rationale |
|---|---|---|---|
| 1 | Same user, multiple allocations to same target | Sum into one `userTotal_u` before `sqrt` (Step 1 above) | Required by spec; also closes the Sybil-via-self-splitting loophole. |
| 2 | Same user, allocations to different targets | Each target computed independently; grouping key is `(userId, targetId)` | User can legitimately support multiple targets; no cross-target interaction. |
| 3 | `amount` is zero | Drop the allocation before grouping (contributes $0 and 0 to `uniqueUserCount` for that target) | A zero-value allocation is not a vote; counting it would let an attacker inflate `uniqueUserCount` for free with zero cost. |
| 4 | `amount` is negative | Reject the whole request with `400` and a validation error naming the offending item | Allocations are contributions, not signed positions; a negative amount is malformed input, not a valid "vote against." Silently clamping or ignoring it would hide bad data from the caller. |
| 5 | `amount` is a non-numeric string / missing / `NaN` / `Infinity` | Reject with `400`, field-level validation error | Fail fast at the boundary — never let bad data reach the math. |
| 6 | `userId` or `targetId` missing/empty/non-string | Reject with `400` | Both are required grouping keys; the response shape is meaningless without them. |
| 7 | Empty array `[]` as input | Accept, return `200` with `[]` | Not an error — "no allocations" is a valid (if boring) state, not malformed input. |
| 8 | Duplicate `userId` differing only by case or surrounding whitespace (`" user_1"` vs `"user_1"`) | Trim whitespace; do **not** case-fold | Whitespace differences are almost certainly transport/formatting noise. Case is left untouched deliberately — IDs are opaque identifiers (often UUIDs or case-sensitive external IDs), and silently merging `User_1`/`user_1` risks merging two genuinely different accounts. Documented as an explicit assumption, not a silent guess. |
| 9 | Very large `amount` | Capped per allocation at `MAX_AMOUNT` (`1e12`); rejected with `400` above that | An individual amount passing `Number.isFinite` doesn't guarantee the *aggregate* sum across many allocations stays finite/precise — capping the individual amount bounds the worst case well inside IEEE-754's exact-integer range (2^53 ≈ 9×10^15), even for a full-size (`MAX_ALLOCATIONS`) request. |
| 10 | Floating-point rounding noise in output (e.g. `9999.999999999998`) | Round `weight` and `rawTotal` to 2 decimal places in the response | Matches the example response shape (`"weight": 123.45`) and avoids leaking float artifacts to API consumers. |
| 11 | Single target with a single $0 total after dropping zero allocations (case 3) | Target is simply omitted from the output — a target only appears if it received at least one valid, positive allocation | Consistent with "weight represents support received"; a target nobody funded isn't a result. |
| 12 | **Sybil attack**: one actor splits $10,000 across 100 fabricated `userId`s to farm the same 100× multiplier as 100 real people | **Explicitly out of scope for correctness, called out as a known limitation** | This is the QF mechanism's well-documented real-world weakness — it assumes `userId` ⇔ one real independent person. Solving it requires identity/proof-of-personhood infrastructure (KYC, social-graph analysis, stake-based Sybil resistance) that is outside a take-home API's scope. The plan is to *state this limitation explicitly* in the README rather than pretend the formula is Sybil-proof — that's the more defensible engineering position than silently ignoring it or over-building an identity system nobody asked for. |
| 13 | Payload is not an array / not valid JSON | Reject with `400` before any processing | Standard input-boundary validation. |
| 14 | Extremely large payload (e.g. 1M allocations) | Grouping is done with hash maps (`Map<targetId, Map<userId, total>>`) — O(n) time, O(unique targets × unique users) space; request length is additionally capped at `MAX_ALLOCATIONS` (`10,000`), rejected with `400` above that | The hash-map grouping has no pathological algorithmic complexity, but that alone doesn't bound *memory* for an arbitrarily large request body — the explicit cap does. Noted for the fullstack version where allocations are persisted, this also bounds the size of a single batch insert (see [05-architecture-fullstack.md](05-architecture-fullstack.md)). |
| 15 | Two targets tie exactly on `weight` | Secondary sort key: `targetId` ascending | Without an explicit tiebreak, ordering among tied targets would depend on `Array.sort`'s stability over Map iteration (insertion) order — an implementation detail, not a documented guarantee. A deterministic secondary key keeps the response order reproducible for identical input. |

## 5. Pseudocode (language-agnostic, both implementations follow this exactly)

```
function computeWeights(allocations):
    validate(allocations)                         # cases 4,5,6,9,13,14 above

    perTargetUserTotals = Map<targetId, Map<userId, number>>

    for a in allocations:
        if a.amount == 0: continue                # case 3
        userId = a.userId.trim()                   # case 8
        key = (a.targetId, userId)
        perTargetUserTotals[a.targetId][userId] += a.amount

    results = []
    for targetId, userTotals in perTargetUserTotals:
        rawTotal = sum(userTotals.values())
        uniqueUserCount = size(userTotals)
        S = sum( sqrt(v) for v in userTotals.values() )
        weight = round(S * S, 2)
        results.push({ targetId, rawTotal: round(rawTotal, 2), uniqueUserCount, weight })

    sort results by weight descending, then targetId ascending   # case 15
    return results
