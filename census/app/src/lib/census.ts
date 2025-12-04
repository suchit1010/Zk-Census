/**
 * Census Program Client
 * 
 * Builds transactions for interacting with the zk-Census Anchor program
 */

import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';

// Program ID (update after deployment)
export const CENSUS_PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');

// SPL Account Compression Program
export const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');

// Noop Program
export const NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');

// Seeds for PDA derivation
const CENSUS_STATE_SEED = Buffer.from('census_state');
const NULLIFIER_SEED = Buffer.from('nullifier');
const MERKLE_TREE_SEED = Buffer.from('merkle_tree');

/**
 * Derive Census State PDA
 */
export function deriveCensusStatePda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CENSUS_STATE_SEED],
    CENSUS_PROGRAM_ID
  );
}

/**
 * Derive Merkle Tree PDA
 */
export function deriveMerkleTreePda(admin: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MERKLE_TREE_SEED, admin.toBuffer()],
    CENSUS_PROGRAM_ID
  );
}

/**
 * Derive Nullifier PDA
 */
export function deriveNullifierPda(nullifierHash: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [NULLIFIER_SEED, nullifierHash],
    CENSUS_PROGRAM_ID
  );
}

interface RegisterCitizenParams {
  admin: PublicKey;
  identityCommitment: Uint8Array;
  connection: Connection;
}

/**
 * Build transaction for registering a new citizen
 */
export async function buildRegisterCitizenTx({
  admin,
  identityCommitment,
  connection,
}: RegisterCitizenParams): Promise<Transaction> {
  const [censusStatePda] = deriveCensusStatePda();

  // Create instruction data with correct discriminator
  // Format: discriminator (8 bytes) + identity_commitment (32 bytes)
  const discriminator = Buffer.from([241, 250, 3, 236, 214, 25, 141, 170]);
  const data = Buffer.concat([
    discriminator,
    Buffer.from(identityCommitment),
  ]);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: censusStatePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: CENSUS_PROGRAM_ID,
    data,
  });

  const tx = new Transaction();
  tx.add(instruction);
  tx.feePayer = admin;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
}

interface SubmitCensusParams {
  payer: PublicKey;
  proofA: Uint8Array;
  proofB: Uint8Array;
  proofC: Uint8Array;
  publicInputs: Uint8Array[];
  connection: Connection;
}

/**
 * Build transaction for submitting a census proof
 */
export async function buildSubmitCensusTx({
  payer,
  proofA,
  proofB,
  proofC,
  publicInputs,
  connection,
}: SubmitCensusParams): Promise<Transaction> {
  const [censusStatePda] = deriveCensusStatePda();
  
  // Nullifier hash is publicInputs[1]
  const nullifierHash = publicInputs[1];
  const [nullifierPda] = deriveNullifierPda(nullifierHash);

  // Create instruction data
  // Format: discriminator (8 bytes) + proof_a + proof_b + proof_c + public_inputs
  const discriminator = Buffer.from([222, 160, 8, 83, 160, 212, 141, 48]);
  const data = Buffer.concat([
    discriminator,
    Buffer.from(proofA),
    Buffer.from(proofB),
    Buffer.from(proofC),
    ...publicInputs.map(p => Buffer.from(p)),
  ]);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: censusStatePda, isSigner: false, isWritable: true },
      { pubkey: nullifierPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: CENSUS_PROGRAM_ID,
    data,
  });

  const tx = new Transaction();
  tx.add(instruction);
  tx.feePayer = payer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
}

/**
 * Fetch current census state from raw account data
 */
export async function fetchCensusStateRaw(connection: Connection) {
  const [censusStatePda] = deriveCensusStatePda();
  const accountInfo = await connection.getAccountInfo(censusStatePda);
  
  if (!accountInfo) {
    throw new Error('Census state not initialized');
  }

  return accountInfo.data;
}

/**
 * Fetch and parse current census state
 */
export async function fetchCensusState(connection: Connection) {
  const data = await fetchCensusStateRaw(connection);
  
  // Account layout: [0-8] discriminator, [8-40] admin, [40-72] merkle_root, etc.
  return {
    admin: new PublicKey(data.slice(8, 40)),
    merkleRoot: data.slice(40, 72),
    merkleTree: new PublicKey(data.slice(72, 104)),
    currentScope: readU64(data, 104),
    scopeStartTime: readI64(data, 112),
    scopeDuration: readI64(data, 120),
    totalRegistered: readU64(data, 128),
    currentPopulation: readU64(data, 136),
    leafCount: readU64(data, 144),
    isActive: data[152] === 1,
    bump: data[153],
  };
}

// Helper to read u64 (little-endian)
function readU64(buffer: Buffer, offset: number): bigint {
  const slice = buffer.slice(offset, offset + 8);
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    result += BigInt(slice[i]) << BigInt(i * 8);
  }
  return result;
}

// Helper to read i64 (little-endian)
function readI64(buffer: Buffer, offset: number): bigint {
  return readU64(buffer, offset);
}

/**
 * Fetch Merkle proof for a leaf index from the indexer API
 */
export async function fetchMerkleProof(connection: Connection, leafIndex: number) {
  const API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:3001';
  
  try {
    const response = await fetch(`${API_URL}/api/merkle-proof/${leafIndex}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert pathElements and root to Uint8Array format
    const siblings = data.pathElements.map((elem: string) => {
      const bigInt = BigInt(elem);
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = Number((bigInt >> BigInt(i * 8)) & BigInt(0xff));
      }
      return bytes;
    });
    
    const rootBigInt = BigInt(data.root);
    const root = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      root[i] = Number((rootBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }
    
    return {
      pathIndices: data.pathIndices,
      siblings,
      root,
      leafIndex: data.leafIndex,
    };
  } catch (error) {
    console.error('Error fetching merkle proof from indexer:', error);
    
    // Fallback to mock proof if indexer unavailable
    console.warn('Falling back to mock proof (all zeros)');
    const TREE_DEPTH = 20;
    const mockSibling = new Uint8Array(32);
    
    return {
      pathIndices: Array(TREE_DEPTH).fill(0),
      siblings: Array(TREE_DEPTH).fill(mockSibling),
      root: new Uint8Array(32),
      leafIndex,
    };
  }
}

/**
 * Fetch Merkle proof by identity commitment
 */
export async function fetchMerkleProofByCommitment(identityCommitment: string) {
  const API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:3001';
  
  try {
    const response = await fetch(`${API_URL}/api/merkle-proof-by-commitment/${identityCommitment}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Identity commitment not found in tree. Have you registered?');
      }
      throw new Error(`API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert pathElements and root to Uint8Array format
    const siblings = data.pathElements.map((elem: string) => {
      const bigInt = BigInt(elem);
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = Number((bigInt >> BigInt(i * 8)) & BigInt(0xff));
      }
      return bytes;
    });
    
    const rootBigInt = BigInt(data.root);
    const root = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      root[i] = Number((rootBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }
    
    return {
      pathIndices: data.pathIndices,
      siblings,
      root,
      leafIndex: data.leafIndex,
    };
  } catch (error) {
    console.error('Error fetching merkle proof by commitment:', error);
    throw error;
  }
}
