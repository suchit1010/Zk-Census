/**
 * ZK Proof Generation Utilities
 * 
 * Handles Groth16 proof generation using snarkjs and formatting for Solana
 * 
 * CRITICAL: Solana's alt_bn128 syscalls expect specific formatting:
 * 1. Big-endian byte order for field elements
 * 2. Negated A point (multiply y-coordinate by -1 in the field)
 */

// Field prime for BN254 curve
const FIELD_PRIME = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

// Lazy-loaded snarkjs (to avoid SSR issues)
let snarkjsInstance: any = null;

async function getSnarkjs() {
  if (!snarkjsInstance) {
    // @ts-ignore - snarkjs types are incomplete
    snarkjsInstance = await import('snarkjs');
  }
  return snarkjsInstance;
}

// Lazy-loaded Poseidon (to avoid SSR issues)
let poseidonInstance: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    const { buildPoseidon } = await import('circomlibjs');
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

export interface ProofInputs {
  identityNullifier: bigint;
  identityTrapdoor: bigint;
  treePathIndices: number[];
  treeSiblings: Uint8Array[];
  signalHash: bigint;
  externalNullifier: bigint;
}

export interface GeneratedProof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
}

export interface SolanaProof {
  proofA: Uint8Array;  // 64 bytes (negated G1 point)
  proofB: Uint8Array;  // 128 bytes (G2 point)
  proofC: Uint8Array;  // 64 bytes (G1 point)
  publicInputs: Uint8Array[];  // Array of 32-byte field elements
}

/**
 * Generate random identity for testing (no NFC required)
 * Creates identity_commitment = Poseidon(nullifier, trapdoor)
 */
export function generateIdentity(): {
  identityNullifier: bigint;
  identityTrapdoor: bigint;
  identityCommitment: Uint8Array;
  identityCommitmentBigInt: bigint;
} {
  // Generate random secrets
  const randomBytes1 = new Uint8Array(32);
  const randomBytes2 = new Uint8Array(32);
  crypto.getRandomValues(randomBytes1);
  crypto.getRandomValues(randomBytes2);
  
  const identityNullifier = bytesToBigInt(randomBytes1) % FIELD_PRIME;
  const identityTrapdoor = bytesToBigInt(randomBytes2) % FIELD_PRIME;
  
  // For now, return simple hash as commitment
  // In production: use Poseidon hash via poseidon([nullifier, trapdoor])
  const commitmentValue = (identityNullifier + identityTrapdoor) % FIELD_PRIME;
  const identityCommitment = bigIntToBytes(commitmentValue, 32);
  
  return {
    identityNullifier,
    identityTrapdoor,
    identityCommitment,
    identityCommitmentBigInt: commitmentValue,
  };
}

/**
 * Generate identity commitment from NFC UID
 * In production, add additional entropy from user
 */
export async function generateIdentityCommitment(nfcUid: string): Promise<{
  commitment: Uint8Array;
  identityNullifier: bigint;
  identityTrapdoor: bigint;
}> {
  const poseidon = await getPoseidon();
  
  // Derive identity secrets from NFC UID
  // In production: use proper key derivation (HKDF) with user secret
  const encoder = new TextEncoder();
  const uidBytes = encoder.encode(nfcUid);
  
  // Hash to get nullifier and trapdoor
  const hash1Buffer = await crypto.subtle.digest('SHA-256', Buffer.from(uidBytes));
  const hash1 = new Uint8Array(hash1Buffer);
  const hash2Buffer = await crypto.subtle.digest('SHA-256', Buffer.from(new Uint8Array([...hash1, 1])));
  const hash2 = new Uint8Array(hash2Buffer);
  
  const identityNullifier = bytesToBigInt(hash1) % FIELD_PRIME;
  const identityTrapdoor = bytesToBigInt(hash2) % FIELD_PRIME;
  
  // Compute Poseidon hash commitment
  const commitmentF = poseidon.F.e(poseidon([identityNullifier, identityTrapdoor]));
  const commitmentBytes = bigIntToBytes(poseidon.F.toObject(commitmentF), 32);
  
  return {
    commitment: commitmentBytes,
    identityNullifier,
    identityTrapdoor,
  };
}

/**
 * Generate Groth16 proof for census submission
 */
export async function generateProof(inputs: ProofInputs): Promise<GeneratedProof> {
  const snarkjs = await getSnarkjs();
  
  // Convert siblings to field elements
  const treeSiblings = inputs.treeSiblings.map(s => bytesToBigInt(s).toString());
  
  // Prepare circuit inputs
  const circuitInputs = {
    identityNullifier: inputs.identityNullifier.toString(),
    identityTrapdoor: inputs.identityTrapdoor.toString(),
    treePathIndices: inputs.treePathIndices,
    treeSiblings,
    signalHash: inputs.signalHash.toString(),
    externalNullifier: inputs.externalNullifier.toString(),
  };

  // Load WASM and zkey files
  // These should be served from /public or a CDN
  const wasmPath = '/circuits/census.wasm';
  const zkeyPath = '/circuits/census_final.zkey';

  // Generate the proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmPath,
    zkeyPath
  );

  return { proof, publicSignals };
}

/**
 * Format snarkjs proof for Solana's alt_bn128 syscalls
 * 
 * CRITICAL: This handles the endianness and negation requirements
 */
export function formatProofForSolana(
  proof: GeneratedProof['proof'],
  publicSignals: string[]
): SolanaProof {
  // 1. Convert proof.pi_a (G1 point) - MUST BE NEGATED
  const proofA = negateG1Point(
    BigInt(proof.pi_a[0]),
    BigInt(proof.pi_a[1])
  );

  // 2. Convert proof.pi_b (G2 point) - Note: coordinates are swapped in snarkjs output
  const proofB = formatG2Point(proof.pi_b);

  // 3. Convert proof.pi_c (G1 point)
  const proofC = formatG1Point(
    BigInt(proof.pi_c[0]),
    BigInt(proof.pi_c[1])
  );

  // 4. Format public inputs (32 bytes each, big-endian)
  const publicInputs = publicSignals.map(s => 
    bigIntToBytes(BigInt(s), 32)
  );

  return { proofA, proofB, proofC, publicInputs };
}

/**
 * Negate G1 point for Solana verification
 * y_neg = FIELD_PRIME - y
 */
function negateG1Point(x: bigint, y: bigint): Uint8Array {
  const result = new Uint8Array(64);
  
  // x coordinate (32 bytes, big-endian)
  const xBytes = bigIntToBytes(x, 32);
  result.set(xBytes, 0);
  
  // Negated y coordinate (32 bytes, big-endian)
  const yNeg = FIELD_PRIME - y;
  const yBytes = bigIntToBytes(yNeg, 32);
  result.set(yBytes, 32);
  
  return result;
}

/**
 * Format G1 point (without negation)
 */
function formatG1Point(x: bigint, y: bigint): Uint8Array {
  const result = new Uint8Array(64);
  result.set(bigIntToBytes(x, 32), 0);
  result.set(bigIntToBytes(y, 32), 32);
  return result;
}

/**
 * Format G2 point for Solana
 * G2 points have 2 coordinates, each with real and imaginary parts
 * snarkjs outputs: [[x_im, x_re], [y_im, y_re]]
 */
function formatG2Point(piB: string[][]): Uint8Array {
  const result = new Uint8Array(128);
  
  // x coordinate (64 bytes): [x_im, x_re] -> [x_re, x_im] for Solana
  result.set(bigIntToBytes(BigInt(piB[0][1]), 32), 0);   // x_re
  result.set(bigIntToBytes(BigInt(piB[0][0]), 32), 32);  // x_im
  
  // y coordinate (64 bytes): [y_im, y_re] -> [y_re, y_im] for Solana
  result.set(bigIntToBytes(BigInt(piB[1][1]), 32), 64);  // y_re
  result.set(bigIntToBytes(BigInt(piB[1][0]), 32), 96);  // y_im
  
  return result;
}

/**
 * Convert BigInt to big-endian bytes
 */
function bigIntToBytes(n: bigint, length: number): Uint8Array {
  const hex = n.toString(16).padStart(length * 2, '0');
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to BigInt (big-endian)
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = '0x';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return BigInt(hex);
}

/**
 * Verify proof locally (for testing)
 */
export async function verifyProofLocally(
  proof: GeneratedProof['proof'],
  publicSignals: string[]
): Promise<boolean> {
  const snarkjs = await getSnarkjs();
  
  const vkeyPath = '/circuits/verification_key.json';
  const vkey = await fetch(vkeyPath).then(r => r.json());
  
  // Add protocol and curve fields required by snarkjs
  const fullProof = {
    ...proof,
    protocol: 'groth16',
    curve: 'bn128'
  };
  
  return snarkjs.groth16.verify(vkey, publicSignals, fullProof);
}
