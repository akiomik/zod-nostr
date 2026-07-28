/**
 * Shared domain check for `<local-part>@<domain>` internet identifiers.
 *
 * Both NIP-05 and LUD-16 describe their identifiers as RFC 5322 §3.4.1
 * "internet identifiers" (email-like `local@domain` addresses) used as a
 * liberal baseline, then restrict the local-part more strictly than RFC 5322 —
 * each with its own rule (NIP-05: `a-z0-9-_.`; LUD-16: the same plus an
 * optional `+tag`). So each spec keeps its own local-part check in its own
 * module; what they genuinely share, and what lives here, is the domain (host)
 * validation: a bare host with no path, query, or fragment.
 *
 * Named for the "internet identifier" term both specs use, rather than
 * `rfc5322` — this validates a pragmatic host subset, not RFC 5322's full
 * addr-spec grammar.
 */
export function isInternetIdentifierDomain(domain: string): boolean {
  try {
    const url = new URL(`https://${domain}`);
    return (
      url.host.toLowerCase() === domain.toLowerCase() &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
