const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
// Largest multiple of the alphabet size that fits in a byte; bytes at or above it are
// discarded so every character is equally likely.
const LIMIT = 256 - (256 % ALPHABET.length);

/** A cryptographically random code of uppercase letters and digits, for invites and check-ins. */
export function randomCode(length = 8): string {
  let code = '';
  while (code.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < LIMIT && code.length < length) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}
