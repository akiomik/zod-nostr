import type * as core from "zod/v4/core";
import {
  zodLiteral,
  zodObject,
  zodOptional,
  zodString,
  zodTuple,
} from "./core/primitives.js";
import { filter, filterTagKeysCheck, subscriptionId } from "./nip01.js";

/**
 * NIP-50 search filter: the NIP-01 `REQ`/`COUNT` filter object extended with an
 * optional `search` string. NIP-50 adds a single `search` field describing a
 * query in human-readable form (e.g. `"best nostr apps"`); the relay interprets
 * it and returns matching events.
 *
 * The field list and unknown-key handling are inherited from `nip01.filter()`
 * (its shape and `"#<letter>"` tag-filter catchall), so this stays in sync with
 * NIP-01 automatically; only `search` and its allowance in the key check are
 * added here.
 *
 * `search` is a plain optional string with no `.min`/recovery policy baked in:
 * NIP-50 places no format constraint on it and does not forbid an empty string,
 * and a consumer wanting a stronger constraint (e.g. a non-empty query) replaces
 * the `search` field with a stricter schema (via `safeExtend`, since the object
 * carries a filter-key check). The
 * `key:value` search extensions (`include:spam`, `domain:`, `language:`, ...)
 * live *inside* the `search` string, not as extra filter fields, so they need no
 * schema modeling; a relay ignores extensions it doesn't support. Ranking search
 * results by score and advertising support via `supported_nips` are relay
 * concerns outside this schema.
 */
function searchFilter() {
  const base = filter();
  return zodObject(
    {
      ...base._zod.def.shape,
      search: zodOptional(zodString()),
    },
    {
      catchall: base._zod.def.catchall as core.SomeType,
      checks: [filterTagKeysCheck(["search"])],
    },
  );
}

/**
 * NIP-50 client-to-relay `REQ` carrying search filters: `["REQ",
 * subscriptionId, searchFilter, ...searchFilter[]]`. An **intentional superset**
 * of `zostr.clientMessage.req()` — a NIP-50 search filter is a NIP-01 filter
 * plus optional `search`, so this also accepts plain NIP-01 filters (a filter
 * with no `search`).
 *
 * At least one filter is required, matching NIP-01's `REQ` grammar (`<filters1>`
 * then `<filters2>...`); the same single search-filter schema validates both the
 * required first filter and the variadic rest.
 *
 * `zostr.clientMessage.req()`/`any()` stay NIP-01-only (they reject `search`),
 * as does `zostr.nip45.countRequest()` — NIP-50 introduces `search` on `REQ`,
 * not `COUNT`. A consumer wanting a NIP-50 `REQ` alongside the other client
 * messages composes `z.union([clientMessage.any(), nip50.req()])`.
 */
function reqMessage() {
  const searchFilter_ = searchFilter();
  return zodTuple(
    [zodLiteral("REQ"), subscriptionId(), searchFilter_],
    searchFilter_,
  );
}

/** NIP-50 search: the `search`-extended filter and the `REQ` that carries it */
export const nip50 = {
  /** NIP-01 filter extended with an optional `search` string */
  filter: searchFilter,
  /** Client-to-relay `["REQ", subscriptionId, searchFilter, ...searchFilter[]]` */
  req: reqMessage,
};
