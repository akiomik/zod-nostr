# 0002 — Documentation altitudes and one-way references

Status: Accepted

Splits the project's prose docs by *altitude* (reference, how-to, rationale) and
fixes the direction references may flow between them. Motivated by task-oriented
content leaking into the API reference.

## Context

The docs were README (positioning, quick start), [API.md](../API.md) (the
reference — what each schema/codec/check is and does), [design.md](../design.md)
(the rationale — the rules the public surface follows), and
[decisions/](../decisions/) (longer-form records like this one). There was no home
for **task-oriented how-to** content — "how do I build a lenient profile", "how do
I compose several opt-in checks".

Two symptoms followed. A how-to ("Recipe: empty-string fields") had accreted
inside API.md, mixing an altitude into the reference and blurring its at-a-glance
scannability. And how-to material that *could* have been written (composing
signature/pow/expiration/auth checks, assembling application schemas from the
atoms) largely wasn't — not for lack of demand, but because there was no place to
put it. The single existing recipe was survivorship: the only how-to that got
written was the one small enough to smuggle into the reference.

## Decision

Give each altitude its own document, and let references flow one way.

- **reference** (what/how each symbol) → `API.md`
- **how-to** (task-oriented recipes) → `guides.md` (new)
- **rationale** (why the surface is shaped this way) → `design.md`
- **decision records** (specific past decisions) → `decisions/`

References flow **one way by altitude**: how-to → reference → rationale. A
higher-altitude (more abstract, slower-changing) doc must be **self-contained** —
it never depends on a lower one to be understood. In particular, rationale
(`design.md`) does not reference how-to (`guides.md`): a principle's explanation
must not become load-bearing on a volatile, frequently-churning guide. The
`guides.md` walkthroughs link *up* to `API.md` and `design.md`; `API.md` and
`README.md` carry *"see also"* pointers down to `guides.md` as navigation, but
their own content stands without it.

Within the rationale layer, `design.md` and `decisions/` reference each other
freely — a decision record is the worked example a principle was derived from, at
the same altitude, so the horizontal link is not a dependency inversion.

This mirrors Diátaxis's four modes (tutorial / how-to / reference / explanation)
and its rule that each mode is self-contained. Tutorials are deliberately out of
scope here — a guided first-run belongs to a future docs surface, not `docs/`.

## Alternatives not chosen

- *Keep how-to in API.md* — every added recipe dilutes the reference further; the
  two altitudes answer different questions ("what is this" vs. "how do I do
  that") and scanning the reference gets worse as how-to grows.
- *Name the how-to doc `recipes.md`* — "recipe" is a narrow, casual synonym for
  how-to that a docs reshuffle is likely to rebrand away. With no static-site
  generator (so no redirects), a published doc path should be a long-lived noun;
  `guides` survives reorganization where `recipes` does not.
- *Let `design.md` link into `guides.md`* — inverts the dependency: the rationale
  would lean on a volatile how-to to be complete, so deleting or reshaping a guide
  could break a principle's explanation. Rejected in favor of keeping `design.md`
  self-contained with a minimal in-place example.
- *Split the full Diátaxis tree now (`how-to/` + `tutorials/` + …)* — overkill for
  the current volume, and the rest of `docs/` is not Diátaxis-named, so matching
  only here buys little.

## Consequences

New how-to content lands in `guides.md`; `API.md` stays a pure reference. Adding a
doc means deciding its altitude (what / how / why) up front, and links respect the
one-way rule — guides point up, reference/README point down as navigation,
rationale points at neither. Altitude-crossing topics that don't fit a single
mode (classic↔mini equivalence, which zod itself documents across reference *and*
tutorial) and tutorials are left for separate design rather than forced into
`guides.md`.
