// Server only. Browser Web Crypto creates the private key; no random keys are
// generated inside Apps Script. Signatures use audited deterministic ECDSA.
import { p256 } from '@noble/curves/nist.js';
export function publicKey(secret) { return Array.from(p256.getPublicKey(Uint8Array.from(secret), false)); }
export function sign(message, secret) { return Array.from(p256.sign(Uint8Array.from(message), Uint8Array.from(secret), {prehash:true,format:'compact',lowS:true,extraEntropy:false})); }
