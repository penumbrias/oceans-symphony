// End-to-end encryption for the friends feature (Phase 3 foundation).
//
// Each system has an ECDH P-256 keypair (Web Crypto — zero dependencies, works
// in browser + Capacitor WebView). The PUBLIC key is published to the relay
// profile so friends can fetch it; the PRIVATE key stays on this device, stored
// (as JWK) on the device-bound FriendIdentity — which is never backed up, so the
// key can't leave the device that way.
//
// Sharing uses hybrid/multi-recipient encryption: a random AES-GCM content key
// encrypts the payload ONCE; that content key is then wrapped separately for
// each recipient via an ECDH-derived pair key. The relay only ever holds
// ciphertext + per-recipient wrapped keys, so the operator (or a breach) can't
// read shared content.
//
// Trust model (documented in-app via E2EInfoCard): public keys are distributed
// trust-on-first-use through the relay, so a malicious relay could in theory
// swap a key — the optional safety-number check defends against that. Keys are
// device-bound with no recovery; static ECDH means no forward secrecy. See the
// in-app explainer for the plain-language + precise versions.

import { localEntities } from "@/api/base44Client";
import { getLocalIdentity, FRIENDS_API_BASE } from "@/lib/friendsApi";

const ECDH = { name: "ECDH", namedCurve: "P-256" };

function hasSubtle() {
  return typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.generateKey === "function";
}

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromB64(s) {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

// Ensure this device's keypair exists; returns { publicKeyJwk, privateKeyJwk }
// (JWKs stored on the device-bound FriendIdentity) or null if no identity yet.
export async function ensureKeyPair() {
  if (!hasSubtle()) return null;
  const id = await getLocalIdentity();
  if (!id) return null;
  if (id.publicKeyJwk && id.privateKeyJwk) {
    return { publicKeyJwk: id.publicKeyJwk, privateKeyJwk: id.privateKeyJwk };
  }
  const kp = await crypto.subtle.generateKey(ECDH, true, ["deriveKey", "deriveBits"]);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  await localEntities.FriendIdentity.update(id.id, { publicKeyJwk, privateKeyJwk });
  return { publicKeyJwk, privateKeyJwk };
}

// Publish the public key to the relay so friends can fetch it. Best-effort.
export async function publishPublicKey() {
  if (!hasSubtle()) return false;
  const id = await getLocalIdentity();
  if (!id?.userId || !id?.secret) return false;
  const me = await ensureKeyPair();
  if (!me) return false;
  try {
    const res = await fetch(`${FRIENDS_API_BASE}/save-pubkey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id.userId, secret: id.secret, publicKey: JSON.stringify(me.publicKeyJwk) }),
    });
    return res.ok;
  } catch { return false; }
}

async function importPriv(jwk) {
  return crypto.subtle.importKey("jwk", jwk, ECDH, false, ["deriveKey", "deriveBits"]);
}
async function importPub(jwk) {
  return crypto.subtle.importKey("jwk", jwk, ECDH, false, []);
}
async function derivePairKey(privJwk, pubJwk) {
  const [priv, pub] = await Promise.all([importPriv(privJwk), importPub(pubJwk)]);
  return crypto.subtle.deriveKey({ name: "ECDH", public: pub }, priv, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// Encrypt `plaintext` (string) for a set of recipients.
// recipients: [{ id, publicKeyJwk }]  (id = recipient's relay userId)
// Returns an envelope safe to store on the relay:
//   { v, iv, ciphertext, recipients: { [id]: { wrapIv, wrapped } }, senderPublicKeyJwk }
export async function encryptForRecipients(plaintext, recipients = []) {
  if (!hasSubtle()) throw new Error("Web Crypto unavailable");
  const me = await ensureKeyPair();
  if (!me) throw new Error("No friends identity");
  const data = new TextEncoder().encode(String(plaintext ?? ""));
  const contentKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, contentKey, data);
  const rawContentKey = await crypto.subtle.exportKey("raw", contentKey);

  const recipMap = {};
  for (const r of recipients) {
    if (!r?.id || !r?.publicKeyJwk) continue;
    try {
      const pairKey = await derivePairKey(me.privateKeyJwk, r.publicKeyJwk);
      const wrapIv = crypto.getRandomValues(new Uint8Array(12));
      const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, pairKey, rawContentKey);
      recipMap[r.id] = { wrapIv: toB64(wrapIv), wrapped: toB64(wrapped) };
    } catch { /* skip a recipient whose key fails */ }
  }
  return { v: 1, iv: toB64(iv), ciphertext: toB64(ciphertext), recipients: recipMap, senderPublicKeyJwk: me.publicKeyJwk };
}

// Decrypt an envelope addressed to me from a given sender. Returns the plaintext
// string, or null if it isn't decryptable (not a recipient / bad key / corrupt).
export async function decryptEnvelope(envelope) {
  if (!hasSubtle() || !envelope) return null;
  const me = await ensureKeyPair();
  const id = await getLocalIdentity();
  if (!me || !id?.userId) return null;
  const r = envelope.recipients?.[id.userId];
  if (!r || !envelope.senderPublicKeyJwk) return null;
  try {
    const pairKey = await derivePairKey(me.privateKeyJwk, envelope.senderPublicKeyJwk);
    const rawContentKey = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(r.wrapIv) }, pairKey, fromB64(r.wrapped));
    const contentKey = await crypto.subtle.importKey("raw", rawContentKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(envelope.iv) }, contentKey, fromB64(envelope.ciphertext));
    return new TextDecoder().decode(plain);
  } catch { return null; }
}

// A stable, symmetric "safety number" both friends can compare out-of-band to
// confirm no key was swapped (Signal-style). Same value on both sides because
// the two public keys are sorted before hashing. 30 digits in 6 groups of 5.
export async function safetyNumber(pubJwkA, pubJwkB) {
  if (!hasSubtle() || !pubJwkA || !pubJwkB) return null;
  const enc = (j) => `${j.crv || ""}.${j.x || ""}.${j.y || ""}`;
  const sorted = [enc(pubJwkA), enc(pubJwkB)].sort().join("|");
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sorted)));
  let digits = "";
  for (let i = 0; i < hash.length && digits.length < 30; i++) digits += String(hash[i]).padStart(3, "0");
  digits = digits.slice(0, 30);
  return digits.match(/.{1,5}/g).join(" ");
}

export function isCryptoAvailable() {
  return hasSubtle();
}
