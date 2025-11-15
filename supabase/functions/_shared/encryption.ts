// supabase/functions/_shared/encryption.ts
// Application-Level Encryption for CMS Credentials

const ENCRYPTION_KEY = Deno.env.get("CMS_CREDENTIALS_ENCRYPTION_KEY");
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM

if (!ENCRYPTION_KEY) {
  console.warn("⚠️ CMS_CREDENTIALS_ENCRYPTION_KEY not set - encryption disabled");
}

/**
 * Get encryption key from environment variable
 * Pads or truncates to 32 bytes (256 bits) for AES-256
 */
function getEncryptionKey(): Uint8Array {
  if (!ENCRYPTION_KEY) {
    throw new Error("CMS_CREDENTIALS_ENCRYPTION_KEY environment variable is required");
  }
  
  // Convert string to bytes
  const keyBytes = new TextEncoder().encode(ENCRYPTION_KEY);
  
  // Pad or truncate to exactly 32 bytes
  const key = new Uint8Array(KEY_LENGTH);
  if (keyBytes.length >= KEY_LENGTH) {
    key.set(keyBytes.slice(0, KEY_LENGTH));
  } else {
    key.set(keyBytes);
    // Pad with zeros (not ideal, but works)
    // Better: Use PBKDF2 for key derivation (see advanced section)
  }
  
  return key;
}

/**
 * Import encryption key for Web Crypto API
 */
async function importKey(): Promise<CryptoKey> {
  const keyMaterial = getEncryptionKey();
  
  return await crypto.subtle.importKey(
    "raw",
    keyMaterial.buffer as ArrayBuffer,
    { name: ALGORITHM },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt credentials object
 * 
 * @param credentials - Plaintext credentials object
 * @returns Base64-encoded encrypted string
 * 
 * Format: Base64(JSON({ iv: Uint8Array, data: Uint8Array }))
 */
export async function encryptCredentials(credentials: any): Promise<string> {
  // If encryption key not set, return plaintext (backward compatibility)
  if (!ENCRYPTION_KEY) {
    console.warn("⚠️ Encryption disabled - storing plaintext credentials");
    return JSON.stringify(credentials);
  }
  
  try {
    // Convert credentials to JSON string
    const plaintext = JSON.stringify(credentials);
    const plaintextBytes = new TextEncoder().encode(plaintext);
    
    // Generate random IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    // Import encryption key
    const key = await importKey();
    
    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: 128, // 128-bit authentication tag for GCM
      },
      key,
      plaintextBytes
    );
    
    // Combine IV and encrypted data
    const encryptedArray = new Uint8Array(encrypted);
    const result = {
      iv: Array.from(iv),
      data: Array.from(encryptedArray),
      // Version marker for future compatibility
      v: 1
    };
    
    // Encode as Base64
    return btoa(JSON.stringify(result));
  } catch (error: any) {
    console.error("❌ Encryption error:", error);
    throw new Error(`Failed to encrypt credentials: ${error.message}`);
  }
}

/**
 * Decrypt credentials string
 * 
 * @param encrypted - Base64-encoded encrypted string
 * @returns Plaintext credentials object
 */
export async function decryptCredentials(encrypted: string): Promise<any> {
  // If encryption key not set, try to parse as plaintext JSON
  if (!ENCRYPTION_KEY) {
    try {
      return JSON.parse(encrypted);
    } catch {
      throw new Error("Encryption key not set and data is not valid JSON");
    }
  }
  
  try {
    // Handle both string and object inputs
    let encryptedString: string;
    if (typeof encrypted === 'string') {
      encryptedString = encrypted;
    } else {
      // If it's already an object, might be plaintext JSON
      try {
        return encrypted; // Return as-is if it's already an object
      } catch {
        encryptedString = JSON.stringify(encrypted);
      }
    }
    
    // Decode Base64
    const decoded = JSON.parse(atob(encryptedString));
    
    // Check if it's encrypted format (has iv and data)
    if (!decoded.iv || !decoded.data) {
      // Not encrypted - return as-is (backward compatibility)
      return decoded;
    }
    
    // Extract IV and encrypted data
    const iv = new Uint8Array(decoded.iv);
    const encryptedData = new Uint8Array(decoded.data);
    
    // Import encryption key
    const key = await importKey();
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: 128,
      },
      key,
      encryptedData
    );
    
    // Convert back to JSON object
    const plaintext = new TextDecoder().decode(decrypted);
    return JSON.parse(plaintext);
  } catch (error: any) {
    console.error("❌ Decryption error:", error);
    
    // If decryption fails, might be plaintext (backward compatibility)
    try {
      if (typeof encrypted === 'string') {
        return JSON.parse(encrypted);
      }
      return encrypted; // Already an object
    } catch {
      throw new Error(`Failed to decrypt credentials: ${error.message}`);
    }
  }
}

/**
 * Check if a string is encrypted
 * 
 * @param data - String to check
 * @returns true if encrypted, false if plaintext
 */
export function isEncrypted(data: string): boolean {
  try {
    if (typeof data !== 'string') {
      return false;
    }
    const decoded = JSON.parse(atob(data));
    return decoded.iv !== undefined && decoded.data !== undefined;
  } catch {
    return false;
  }
}

/**
 * Migrate plaintext credentials to encrypted format
 * 
 * @param plaintextCredentials - Plaintext credentials object
 * @returns Encrypted credentials string
 */
export async function migrateToEncrypted(plaintextCredentials: any): Promise<string> {
  return await encryptCredentials(plaintextCredentials);
}

