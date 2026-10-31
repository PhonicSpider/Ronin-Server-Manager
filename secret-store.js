'use strict';

// Protects secrets (the Citadel agent token, the REST API key) when they are
// written to disk. Electron's safeStorage encrypts with the Windows Data
// Protection API, so the stored value can only be decrypted by the same Windows
// user on the same machine -- a copied or backed-up settings file is useless to
// anyone else. Previously both secrets sat in plaintext JSON.
//
// Stored form:  "enc:v1:<base64 ciphertext>"
// Legacy plaintext values (written by older RSM versions) still load, and are
// re-written encrypted the first time they are read.

const ENCRYPTED_PREFIX = 'enc:v1:';

function createSecretStore(safeStorage) {
    function isAvailable() {
        try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
    }

    function isEncrypted(storedValue) {
        return typeof storedValue === 'string' && storedValue.startsWith(ENCRYPTED_PREFIX);
    }

    // Returns the value to write to disk. Falls back to plaintext only when the
    // platform offers no encryption, rather than losing the secret.
    function protect(plainText) {
        if (!plainText) return '';
        if (isEncrypted(plainText) || !isAvailable()) return plainText;
        return ENCRYPTED_PREFIX + safeStorage.encryptString(plainText).toString('base64');
    }

    // Returns the usable secret from whatever is on disk. A value that cannot be
    // decrypted (settings copied from another PC/user) yields '' so the user is
    // asked to re-enter it instead of the app sending garbage.
    function reveal(storedValue) {
        if (!storedValue) return '';
        if (!isEncrypted(storedValue)) return storedValue;
        try {
            return safeStorage.decryptString(Buffer.from(storedValue.slice(ENCRYPTED_PREFIX.length), 'base64'));
        } catch (error) {
            console.warn(`[RSM] Could not decrypt a stored secret (${error.message}) -- it must be entered again.`);
            return '';
        }
    }

    return { isAvailable, isEncrypted, protect, reveal };
}

module.exports = { createSecretStore, ENCRYPTED_PREFIX };
