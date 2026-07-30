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
zostr.nip05.identifier();
zostr.nip10.textNote();
zostr.nip10.eTag();
zostr.nip10.qTag();
zostr.nip11.relayInformationDocument();
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

// Named type export, exercised from both entry points, and classic/Mini parity.
const profile: ProfileMetadata = { name: "alice", customField: 1 };
const miniProfile: MiniProfileMetadata = profile; // classic assignable to mini
const classicProfile: ProfileMetadata = miniProfile; // and back — same type
void classicProfile;

// Mini exposes the same canonical surface, driven by the functional API.
miniZostr.nip01.event();
miniZostr.event();
zMini.parse(miniZostr.event(), signed);
zMini.encode(miniZostr.nprofile(), { pubkey: pk, relays: [] });
// @ts-expect-error the pointer shape is strict in the mini flavor too
zMini.encode(miniZostr.nprofile(), { pubkey: pk, relays: [], extra: 1 });
