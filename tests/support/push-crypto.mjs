import {
  createECDH,
  randomBytes,
  hkdfSync,
  createDecipheriv,
} from "node:crypto";
export function receiver() {
  const key = createECDH("prime256v1");
  const publicKey = key.generateKeys();
  const auth = randomBytes(16);
  return {
    key,
    publicKey,
    auth,
    keys: {
      p256dh: publicKey.toString("base64url"),
      auth: auth.toString("base64url"),
    },
  };
}
/** Independent RFC 8291 decoding using Node/OpenSSL, not the bundled sender. */
export function decryptPush(payload, ua) {
  const body = Buffer.from(payload),
    salt = body.subarray(0, 16),
    rs = body.readUInt32BE(16),
    idlen = body[20];
  if (rs !== 4096 || idlen !== 65)
    throw Error("Invalid content encoding header");
  const serverPublic = body.subarray(21, 21 + idlen),
    ciphertext = body.subarray(21 + idlen);
  const shared = ua.key.computeSecret(serverPublic),
    info = Buffer.concat([
      Buffer.from("WebPush: info\0"),
      ua.publicKey,
      serverPublic,
    ]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, ua.auth, info, 32));
  const cek = Buffer.from(
    hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0"),
      16,
    ),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );
  const cipher = createDecipheriv("aes-128-gcm", cek, nonce);
  cipher.setAuthTag(ciphertext.subarray(-16));
  const clear = Buffer.concat([
    cipher.update(ciphertext.subarray(0, -16)),
    cipher.final(),
  ]);
  if (clear.at(-1) !== 2) throw Error("Invalid record delimiter");
  return JSON.parse(clear.subarray(0, -1).toString("utf8"));
}
