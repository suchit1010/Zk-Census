/**
 * Anchor-based Census Program Client
 * 
 * Uses Anchor Program SDK for proper instruction building
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import censusIdl from './census.json';

export const CENSUS_PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');

/**
 * Get Anchor Program instance
 */
export function getCensusProgram(connection: Connection, wallet: Wallet) {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  
  return new Program(censusIdl as any, provider);
}

/**
 * Derive Census State PDA
 */
export function deriveCensusStatePda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('census_state')],
    CENSUS_PROGRAM_ID
  );
}

/**
 * Derive Nullifier PDA
 */
export function deriveNullifierPda(nullifierHash: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('nullifier'), nullifierHash],
    CENSUS_PROGRAM_ID
  );
}

interface SubmitCensusParams {
  program: Program;
  payer: PublicKey;
  proofA: number[];
  proofB: number[];
  proofC: number[];
  publicInputs: number[][];
}

/**
 * Build submit_census instruction using Anchor
 */
export async function buildSubmitCensusIx({
  program,
  payer,
  proofA,
  proofB,
  proofC,
  publicInputs,
}: SubmitCensusParams) {
  const [censusStatePda] = deriveCensusStatePda();
  
  // Nullifier hash is publicInputs[1]
  const nullifierHash = new Uint8Array(publicInputs[1]);
  const [nullifierPda] = deriveNullifierPda(nullifierHash);

  return program.methods
    .submitCensus(proofA, proofB, proofC, publicInputs)
    .accounts({
      payer,
      censusState: censusStatePda,
      nullifier: nullifierPda,
    })
    .instruction();
}

/**
 * Fetch current census state
 */
export async function fetchCensusState(connection: Connection) {
  const [censusStatePda] = deriveCensusStatePda();
  const accountInfo = await connection.getAccountInfo(censusStatePda);
  
  if (!accountInfo) {
    throw new Error('Census state not initialized');
  }

  // Parse account data - NO discriminator for data accounts!
  const data = accountInfo.data;
  
  return {
    admin: new PublicKey(data.slice(0, 32)),
    merkleRoot: data.slice(32, 64),
    merkleTree: new PublicKey(data.slice(64, 96)),
    currentScope: readU64(data, 96),
    scopeStartTime: readI64(data, 104),
    scopeDuration: readI64(data, 112),
    totalRegistered: readU64(data, 120),
    currentPopulation: readU64(data, 128),
    leafCount: readU64(data, 136),
    isActive: data[144] === 1,
    bump: data[145],
  };
}

/**
 * Fetch Merkle proof for a leaf index (mock for demo)
 */
export async function fetchMerkleProof(connection: Connection, leafIndex: number) {
  const TREE_DEPTH = 20;
  const mockSibling = new Uint8Array(32); // All zeros
  
  return {
    pathIndices: Array(TREE_DEPTH).fill(0),
    siblings: Array(TREE_DEPTH).fill(mockSibling),
    root: new Uint8Array(32),
  };
}

// Helper functions
function readU64(buffer: Buffer, offset: number): bigint {
  const slice = buffer.slice(offset, offset + 8);
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    result += BigInt(slice[i]) << BigInt(i * 8);
  }
  return result;
}

function readI64(buffer: Buffer, offset: number): bigint {
  return readU64(buffer, offset);
}
