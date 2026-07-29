# 0001 — Separate kind:0 metadata shape from its transport

Status: Accepted

The kind:0 (profile metadata) API is the worked example the public-API design
principles in [../design.md](../design.md) were derived from — specifically
*separate shape from transport*, *expose strict atoms*, and *do not bake in
recovery policy*.

## Context

The original `nip01.metadata()` was a single codec (JSON string ⇄ an all-required
`{ name, display_name, picture, nip05 }` object). Real consumers couldn't reuse
the shape, reuse individual fields, or apply their own fallbacks, so they
re-implemented the profile schema by hand — the codec exposed the
least-composable form and hid the most-composable one.

## Decision

Separate the concerns into distinct, composable layers:

- `nip01.metadataFields` — strict, non-optional field atoms (0.2.1).
- `nip01.metadata()` — an object schema: known fields optional and strictly
  validated, no baked-in recovery policy, unknown keys **preserved** as `unknown`.
- `jsonCodec(schema)` — the generic JSON transport.
- `nip01.metadataContent()` — the convenience codec, `jsonCodec(metadata())`.

## Alternatives not chosen

- *Expose only the codec's `.out` schema* — classic's `.out` is a public
  property, but it holds a raw core schema without the flavor-native object API
  (`.parse`/`.extend`/`.pick`), and zod/mini doesn't expose `.out` as an
  instance property at all — so it isn't an equivalent, composable object
  surface across both flavors.
- *Compose via intersection only* — can't relax or override an existing field's
  validation, only add.
- *Bake fallbacks (`.catch`/`.default`) into the base* — irreversible; a
  consumer can't recover the strict behavior (recovery-policy asymmetry).
- *`catchall(z.json())` for unknown keys* — its inferred type conflicts with the
  optional known fields (an index signature can't hold `undefined`), so the
  schema would reject a value it itself produces; `unknown` avoids this.
- *Recursive `preflight` in the codec's encode* — chases a general
  "is-this-JSON-serializable" problem that belongs in the schema, not a
  serializer; the encode contract stays `JSON.stringify` semantics instead.

## Consequences

Consumers compose freely (relax, tighten, reuse a subset, per-field fallbacks)
and unknown fields survive a round-trip; in exchange, the JSON-serializability
guarantee of a composed schema is the consumer's to express in that schema, not
something the transport enforces.
