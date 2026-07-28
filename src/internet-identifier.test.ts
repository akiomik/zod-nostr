import { describe, expect, it } from "vitest";
import { isInternetIdentifierDomain } from "./internet-identifier.js";

// Shared by NIP-05 and LUD-16 identifiers. Only the domain (host) portion is
// validated here; local-part rules live in each spec's own module.
describe("isInternetIdentifierDomain", () => {
  it.each([
    "example.com",
    "sub.domain.example.com",
    "xyz.onion",
    "EXAMPLE.com", // host comparison is case-insensitive
  ])("accepts a bare host: %s", (domain) => {
    expect(isInternetIdentifierDomain(domain)).toBe(true);
  });

  it.each([
    ["a path", "example.com/path"],
    ["a query", "example.com?q=1"],
    ["a fragment", "example.com#frag"],
    ["userinfo ('@')", "user@example.com"],
    ["whitespace", "example .com"],
    ["a scheme", "https://example.com"],
    ["an empty string", ""],
  ])("rejects %s: %j", (_label, domain) => {
    expect(isInternetIdentifierDomain(domain)).toBe(false);
  });
});
