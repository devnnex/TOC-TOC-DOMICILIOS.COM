// Server only. VAPID uses deterministic ECDSA. Encryption randomness is supplied
// by Apps Script UUIDs; neither private keys nor plaintext are logged.
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { gcm } from "@noble/ciphers/aes.js";
export function publicKey(secret) {
  return Array.from(p256.getPublicKey(Uint8Array.from(secret), false));
}
export function sign(message, secret) {
  return Array.from(
    p256.sign(Uint8Array.from(message), Uint8Array.from(secret), {
      prehash: true,
      format: "compact",
      lowS: true,
      extraEntropy: false,
    }),
  );
}
export function validReceiver(publicBytes) {
  try {
    p256.Point.fromBytes(Uint8Array.from(publicBytes)).assertValidity();
    return true;
  } catch {
    return false;
  }
}
const ascii = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const join = (...arrays) =>
  Uint8Array.from(arrays.flatMap((a) => Array.from(a)));
/** RFC 8291 + RFC 8188, one final aes128gcm record. */
export function encrypt(message, receiver, auth, secret, saltBytes) {
  const priv = Uint8Array.from(secret),
    ua = Uint8Array.from(receiver),
    salt = Uint8Array.from(saltBytes);
  if (
    salt.length !== 16 ||
    auth.length !== 16 ||
    ua.length !== 65 ||
    message.length > 3500
  )
    throw new Error("Invalid push parameters");
  const as = p256.getPublicKey(priv, false),
    shared = p256.getSharedSecret(priv, ua, false).slice(1, 33);
  const ikm = hkdf(
    sha256,
    shared,
    Uint8Array.from(auth),
    join(ascii("WebPush: info\0"), ua, as),
    32,
  );
  const key = hkdf(
    sha256,
    ikm,
    salt,
    ascii("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = hkdf(sha256, ikm, salt, ascii("Content-Encoding: nonce\0"), 12);
  const encrypted = gcm(key, nonce).encrypt(join(message, [2]));
  return Array.from(join(salt, [0, 0, 16, 0, 65], as, encrypted));
}
