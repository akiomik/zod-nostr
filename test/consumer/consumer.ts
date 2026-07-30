// External-consumer compile fixture. Imports the package exactly as a consumer
// does (published specifiers, resolved to the built declarations — see
// tsconfig.json), and asserts the public type contract. Type-checked by
// `npm run test:consumer`; it emits nothing and is never executed.

import * as zMini from "zod/mini";
import type { ProfileMetadata } from "zod-nostr";
import { zostr } from "zod-nostr";
import type { ProfileMetadata as MiniProfileMetadata } from "zod-nostr/mini";
import { zostr as miniZostr } from "zod-nostr/mini";

// Canonical owner paths resolve.
zostr.nip01.event();
zostr.nip01.relayMessage.ok();
zostr.nip01.clientMessage.req();
zostr.nip19.npub();
zostr.nip21.uri();
zostr.nip21.npub();
zostr.nip21.any();
zostr.nip05.identifier();
zostr.nip10.textNote();
zostr.nip10.eTag();
zostr.nip10.qTag();
zostr.nip11.relayInformationDocument();
zostr.nip13.nonceTag();
zostr.nip40.expirationTag();
zostr.nip42.relayMessage.auth();
zostr.nip42.clientMessage.auth();
zostr.nip45.clientMessage.count();
zostr.nip45.relayMessage.count();
zostr.nip50.clientMessage.req();
zostr.nip67.relayMessage.eose();
zostr.jsonCodec(zostr.nip01.event());

// Root aliases resolve and are the same factory as their canonical path.
const aliasIdentity: boolean =
  zostr.event === zostr.nip01.event && zostr.npub === zostr.nip19.npub;
void aliasIdentity;

// The removed root message namespaces are gone from the type.
// @ts-expect-error root relayMessage was removed (now zostr.nip01.relayMessage)
zostr.relayMessage;
// @ts-expect-error root clientMessage was removed (now zostr.nip01.clientMessage)
zostr.clientMessage;
// @ts-expect-error textNote moved to its NIP-10 canonical owner
zostr.nip01.textNote;

// An event embedded in a message infers a strict object (no unknown index
// access), matching its runtime rejection of unknown keys.
const signed = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 0,
  kind: 1,
  tags: [] as string[][],
  content: "",
  sig: "c".repeat(128),
};
const relayed = zostr.nip01.relayMessage.event().parse(["EVENT", "s", signed]);
// @ts-expect-error embedded event output is strict
relayed[2].extension;

// A NIP-19 pointer rejects unknown keys in its input type.
const pk = "b".repeat(64);
zostr.nprofile().encode({ pubkey: pk, relays: [] });
// @ts-expect-error extra keys are not part of the pointer shape
zostr.nprofile().encode({ pubkey: pk, relays: [], extra: 1 });

// NIP-10 reply/thread tags infer precise shapes, and the opt-in checks compose
// onto textNote() through the resolved declarations a consumer actually sees.
const id64 = "a".repeat(64);
const eTag = zostr.nip10.eTag().parse(["e", id64, "", "root", pk]);
const eMarker: "" | "root" | "reply" | undefined = eTag[3];
void eMarker;
const qName: "q" = zostr.nip10.qTag().parse(["q", id64, ""])[0];
void qName;
zostr.nip10
  .textNote()
  .check(zostr.nip10.threadCheck())
  .check(zostr.nip10.participantsCheck([pk]));

// NIP-13 proof of work. The nonce tag infers a precise tuple (literal name +
// optional target), and the opt-in checks compose onto an event schema — both
// exercised through the resolved classic/mini declarations below.
const nonceTag = zostr.nip13.nonceTag().parse(["nonce", "1", "8"]);
const nonceName: "nonce" = nonceTag[0];
const nonceTarget: string | undefined = nonceTag[2];
void [nonceName, nonceTarget];
zostr
  .event()
  .check(zostr.nip13.powCheck(20))
  .check(zostr.nip13.commitmentCheck(20));

// NIP-40 expiration. The expiration tag infers a precise tuple (literal name +
// string timestamp), and the opt-in check composes onto an event schema.
const expirationTag = zostr.nip40
  .expirationTag()
  .parse(["expiration", "1700000000"]);
const expirationName: "expiration" = expirationTag[0];
const expirationTs: string = expirationTag[1];
void [expirationName, expirationTs];
zostr.event().check(zostr.nip40.expirationCheck(1700000000));

// NIP-21 nostr: URIs. The full surface is exercised in BOTH flavors so a
// one-sided flavor gap or a degraded pointer type fails this compile gate.
// (Compile-only fixture: decode arguments are typed `string`; runtime validity
// is irrelevant.)
const npubUriExample = "nostr:npub1example";
const nprofileUriExample = "nostr:nprofile1example";

// uri()'s prefix is typed to the supported entities; "nsec" is excluded.
zostr.nip21.uri("npub");
// @ts-expect-error nsec is not a supported NIP-21 URI entity
zostr.nip21.uri("nsec");
miniZostr.nip21.uri("npub");
// @ts-expect-error nsec is not a supported NIP-21 URI entity (mini)
miniZostr.nip21.uri("nsec");

// Every per-entity codec's input/output types are exact — classic.
const cNpubHex: string = zostr.nip21.npub().decode(npubUriExample);
const cNpubUri: string = zostr.nip21.npub().encode(pk);
const cNoteId: string = zostr.nip21.note().decode("nostr:note1x");
void zostr.nip21.note().encode(pk);
const cProfile = zostr.nip21.nprofile().decode(nprofileUriExample);
const cProfilePubkey: string = cProfile.pubkey;
zostr.nip21.nprofile().encode({ pubkey: pk, relays: [] });
const cEvent = zostr.nip21.nevent().decode("nostr:nevent1x");
const cEventId: string = cEvent.id;
const cEventKind: number | undefined = cEvent.kind;
zostr.nip21.nevent().encode({ id: pk, relays: [] });
const cAddr = zostr.nip21.naddr().decode("nostr:naddr1x");
const cAddrKind: number = cAddr.kind;
zostr.nip21
  .naddr()
  .encode({ identifier: "d", pubkey: pk, kind: 30023, relays: [] });
void [
  cNpubHex,
  cNpubUri,
  cNoteId,
  cProfilePubkey,
  cEventId,
  cEventKind,
  cAddrKind,
];
// A per-entity pointer codec's input is strict (classic).
// @ts-expect-error the pointer shape rejects unknown keys
zostr.nip21.nprofile().encode({ pubkey: pk, relays: [], extra: 1 });

// Every per-entity codec's input/output types are exact — mini.
const mNpubHex: string = zMini.decode(miniZostr.nip21.npub(), npubUriExample);
const mNpubUri: string = zMini.encode(miniZostr.nip21.npub(), pk);
const mNoteId: string = zMini.decode(miniZostr.nip21.note(), "nostr:note1x");
void zMini.encode(miniZostr.nip21.note(), pk);
const mProfile = zMini.decode(miniZostr.nip21.nprofile(), nprofileUriExample);
const mProfilePubkey: string = mProfile.pubkey;
zMini.encode(miniZostr.nip21.nprofile(), { pubkey: pk, relays: [] });
const mEvent = zMini.decode(miniZostr.nip21.nevent(), "nostr:nevent1x");
const mEventId: string = mEvent.id;
zMini.encode(miniZostr.nip21.nevent(), { id: pk, relays: [] });
const mAddr = zMini.decode(miniZostr.nip21.naddr(), "nostr:naddr1x");
const mAddrKind: number = mAddr.kind;
zMini.encode(miniZostr.nip21.naddr(), {
  identifier: "d",
  pubkey: pk,
  kind: 30023,
  relays: [],
});
void [mNpubHex, mNpubUri, mNoteId, mProfilePubkey, mEventId, mAddrKind];
// A per-entity pointer codec's input is strict (mini).
// @ts-expect-error the pointer shape rejects unknown keys (mini)
zMini.encode(miniZostr.nip21.nprofile(), { pubkey: pk, relays: [], extra: 1 });

// any() decodes to a { type, data } discriminated union that narrows by `type`,
// with strict encode inputs — classic.
const decodedUri = zostr.nip21.any().decode(npubUriExample);
if (decodedUri.type === "npub") {
  const decodedPubkey: string = decodedUri.data;
  void decodedPubkey;
} else if (decodedUri.type === "nprofile") {
  const pointerPubkey: string = decodedUri.data.pubkey;
  void pointerPubkey;
}
zostr.nip21
  .any()
  .encode({ type: "nprofile", data: { pubkey: pk, relays: [] } });
// @ts-expect-error the branch object rejects unknown keys
zostr.nip21.any().encode({ type: "npub", data: pk, extra: 1 });
zostr.nip21.any().encode({
  type: "nprofile",
  // @ts-expect-error the pointer shape rejects unknown keys
  data: { pubkey: pk, relays: [], extra: 1 },
});

// any() narrowing and strict encode inputs — mini.
const miniDecodedUri = zMini.decode(miniZostr.nip21.any(), npubUriExample);
if (miniDecodedUri.type === "nprofile") {
  const miniPointerPubkey: string = miniDecodedUri.data.pubkey;
  void miniPointerPubkey;
}
zMini.encode(miniZostr.nip21.any(), {
  type: "nprofile",
  data: { pubkey: pk, relays: [] },
});
// @ts-expect-error the branch object rejects unknown keys (mini)
zMini.encode(miniZostr.nip21.any(), { type: "npub", data: pk, extra: 1 });
zMini.encode(miniZostr.nip21.any(), {
  type: "nprofile",
  // @ts-expect-error the pointer shape rejects unknown keys (mini)
  data: { pubkey: pk, relays: [], extra: 1 },
});

// Named type export, exercised from both entry points, and classic/Mini parity.
const profile: ProfileMetadata = { name: "alice", customField: 1 };
const miniProfile: MiniProfileMetadata = profile; // classic assignable to mini
const classicProfile: ProfileMetadata = miniProfile; // and back — same type
void classicProfile;

// Mini exposes the same canonical surface, driven by the functional API.
miniZostr.nip01.event();
miniZostr.event();
zMini.parse(miniZostr.event(), signed);
// NIP-13 across the mini flavor: nonce tag type (literal name + optional
// target, so a degraded [0] type also fails this gate) and check composition.
const miniNonceTag = zMini.parse(miniZostr.nip13.nonceTag(), [
  "nonce",
  "1",
  "8",
]);
const miniNonceName: "nonce" = miniNonceTag[0];
const miniNonceTarget: string | undefined = miniNonceTag[2];
void [miniNonceName, miniNonceTarget];
miniZostr
  .event()
  .check(miniZostr.nip13.powCheck(20))
  .check(miniZostr.nip13.commitmentCheck(20));
// NIP-40 across the mini flavor: expiration tag type + check composition.
const miniExpirationTag = zMini.parse(miniZostr.nip40.expirationTag(), [
  "expiration",
  "1700000000",
]);
const miniExpirationName: "expiration" = miniExpirationTag[0];
const miniExpirationTs: string = miniExpirationTag[1];
void [miniExpirationName, miniExpirationTs];
miniZostr.event().check(miniZostr.nip40.expirationCheck(1700000000));
zMini.encode(miniZostr.nprofile(), { pubkey: pk, relays: [] });
// @ts-expect-error the pointer shape is strict in the mini flavor too
zMini.encode(miniZostr.nprofile(), { pubkey: pk, relays: [], extra: 1 });
