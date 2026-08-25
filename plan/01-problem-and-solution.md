# The Problem and the Solution

## Plain-language version

Imagine a pool of money is going to get split between a few projects (`targetId`s), based on
how much support each project got. The naive way to decide support is: just add up the
dollars. Whoever raised the most, wins.

That's a problem. One whale with $10,000 would beat 100 ordinary people who each chipped in
$100  -  even though the second case is a much stronger signal that *the crowd* actually wants
that project funded. A single rich account isn't "the community." A hundred independent
people voting with their wallets is much closer to a real consensus.

So the API isn't just "sum the money per project." It has to answer: *how much does the
community, as a group of independent people, actually support this?* Money still matters
(a project two people fund with $1 each shouldn't beat one four people fund with $1000 each),
but the number of independent supporters matters more, proportionally, than the size of any
one check.

## Technical version

We need a scoring function `weight(target)` computed from a multiset of allocations
`{userId, targetId, amount}`, grouped by `targetId`, such that it is:

- **Monotonic in total capital**: more money to a target, all else equal, never decreases its
  weight.
- **Monotonic in participant count**: more unique contributors, all else equal, never
  decreases its weight.
- **Strictly sub-linear in per-user contribution**: the *marginal* weight added by the Nth
  dollar from a single user is smaller than the marginal weight added by the same dollar
  coming from a new user. This is the actual mechanism that produces "consensus > capital"  -
  without it, `weight = rawTotal` and the two properties above collapse into a pure plutocracy.
- **Provably dampening at the scale required by the spec**: 100 users × $100 must score at
  least 2× higher than 1 user × $10,000, for the same $10,000 raw total.

This is a solved problem in mechanism design  -  it's the exact shape of **Quadratic Funding
(QF)**, introduced by Buterin, Hitzig & Weyl for allocating public-goods funding in a way that
resists plutocratic capture. The chosen formula (full derivation and worked numbers in
[02-algorithm-and-edge-cases.md](02-algorithm-and-edge-cases.md)) is the QF matching formula:

```
weight(target) = ( Σ over unique users u of sqrt(userTotal_u) )²
```

Two things make this the right fit rather than an arbitrary pick:

1. It's purpose-built for exactly this property  -  it is literally the formula the field uses
   when the stated goal is "broad support should beat concentrated capital."
2. It's auditable. `sqrt` then re-`square` is a two-line function with no tunable knobs to
   justify, no arbitrary constants to defend in a design review.

## What "handle edge cases" means here

The spec explicitly calls out identifying and handling edge cases as part of the grading bar.
The full catalog  -  multiple allocations from one user to one target, zero/negative amounts,
malformed payloads, empty input, floating-point precision, and the formula's own known
weakness (Sybil attacks: splitting one whale into many fake `userId`s)  -  is enumerated with a
decision for each in
[02-algorithm-and-edge-cases.md](02-algorithm-and-edge-cases.md#edge-case-catalog).
