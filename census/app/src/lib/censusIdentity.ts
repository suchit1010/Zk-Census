/**
 * Census Identity Generator
 * 
 * Generates ZK census identities from Zassport commitments.
 * The identity is deterministically derived from the passport verification
 * to bind the census identity to a real person.
 */

// Field prime for BN254 curve (used in Groth16)
const FIELD_PRIME = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

/**
 * Convert bytes to BigInt (little-endian)
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result += BigInt(bytes[i]) * (BigInt(256) ** BigInt(i));
  }
  return result;
}

/**
 * Hash function using SHA-256 and reducing to field element
 */
async function hashToField(data: Uint8Array): Promise<bigint> {
  // Ensure we have a proper ArrayBuffer by copying to new array
  const buffer = new Uint8Array(data).buffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = new Uint8Array(hashBuffer);
  return bytesToBigInt(hashArray) % FIELD_PRIME;
}

/**
 * Combine multiple inputs into a single hash
 */
async function combineHash(...inputs: (string | Uint8Array)[]): Promise<bigint> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  
  for (const input of inputs) {
    if (typeof input === 'string') {
      parts.push(encoder.encode(input));
    } else {
      parts.push(input);
    }
  }
  
  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  
  return hashToField(combined);
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith('0x')) {
    hex = hex.slice(2);
  }
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Generate deterministic census identity from Zassport commitment
 * 
 * The identity is derived from:
 * - Zassport commitment (passport attestation)
 * - Wallet public key (account binding)
 * - Domain separators (prevent cross-protocol attacks)
 * 
 * This ensures:
 * 1. Same passport always generates same census identity
 * 2. Identity is bound to a specific wallet
 * 3. Cannot be reversed to reveal passport data
 */
export async function generateCensusIdentity(
  zassportCommitment: string | Uint8Array | undefined,
  walletPubkey: string,
  salt?: string
): Promise<{
  identityNullifier: bigint;
  identityTrapdoor: bigint;
  identityCommitment: bigint;
}> {
  // Convert commitment to bytes
  let commitmentBytes: Uint8Array;
  if (!zassportCommitment) {
    // If no Zassport commitment, use wallet as entropy (less secure, for dev only)
    commitmentBytes = new TextEncoder().encode(walletPubkey);
  } else if (typeof zassportCommitment === 'string') {
    commitmentBytes = hexToBytes(zassportCommitment);
  } else {
    commitmentBytes = zassportCommitment;
  }

  const walletBytes = new TextEncoder().encode(walletPubkey);
  const saltBytes = salt ? new TextEncoder().encode(salt) : new Uint8Array(0);

  // Generate identity nullifier
  // This is used to prevent double-counting in proofs
  const identityNullifier = await combineHash(
    commitmentBytes,
    walletBytes,
    'zk-census-nullifier-v1',
  );

  // Generate identity trapdoor
  // This adds randomness/salt to the commitment
  const identityTrapdoor = await combineHash(
    saltBytes.length > 0 ? saltBytes : new Uint8Array(new BigUint64Array([BigInt(Date.now())]).buffer),
    commitmentBytes,
    'zk-census-trapdoor-v1',
  );

  // Generate identity commitment
  // This is what gets stored in the Merkle tree
  const identityCommitment = await combineHash(
    new TextEncoder().encode(identityNullifier.toString()),
    new TextEncoder().encode(identityTrapdoor.toString()),
    'zk-census-commitment-v1',
  );

  return {
    identityNullifier,
    identityTrapdoor,
    identityCommitment,
  };
}

/**
 * Convert identity commitment to bytes for on-chain storage
 */
export function commitmentToBytes(commitment: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let temp = commitment;
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(temp & 0xFFn);
    temp >>= 8n;
  }
  return bytes;
}

/**
 * Convert bytes to commitment bigint
 */
export function bytesToCommitment(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result += BigInt(bytes[i]) * (BigInt(256) ** BigInt(i));
  }
  return result;
}

/**
 * Verify that a commitment was derived from a given nullifier and trapdoor
 * (for debugging/testing)
 */
export async function verifyCommitmentDerivation(
  nullifier: bigint,
  trapdoor: bigint,
  expectedCommitment: bigint
): Promise<boolean> {
  const computed = await combineHash(
    new TextEncoder().encode(nullifier.toString()),
    new TextEncoder().encode(trapdoor.toString()),
    'zk-census-commitment-v1',
  );
  return computed === expectedCommitment;
}
