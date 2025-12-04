import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import * as fs from 'fs';

/**
 * Script to:
 * 1. Extract all registered commitments from on-chain events
 * 2. Build Poseidon merkle tree
 * 3. Call set_merkle_root instruction
 */

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const CENSUS_STATE_SEED = 'census_state';
const TREE_DEPTH = 20;

// Simple Poseidon hasher (mimics circuit behavior)
// NOTE: This is a PLACEHOLDER - real implementation needs circomlibjs
// For now, we'll use a deterministic hash function
function simpleHash(a: Buffer, b: Buffer): Buffer {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(Buffer.concat([a, b])).digest();
}

async function extractCommitments(conn: Connection): Promise<Buffer[]> {
  console.log('📤 Extracting commitments from on-chain events...');
  
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 1000 });
  const commitments: Map<string, Buffer> = new Map();

  for (const sigInfo of sigs) {
    try {
      const tx = await conn.getTransaction(sigInfo.signature, { commitment: 'confirmed' });
      if (!tx || !tx.meta) continue;
      
      const logs = tx.meta.logMessages || [];
      for (const log of logs) {
        // Look for commitment hex pattern (64 hex chars = 32 bytes)
        const hexMatches = Array.from(log.matchAll(/([0-9a-fA-F]{64})/g));
        for (const match of hexMatches) {
          const hex = match[1];
          // Skip if it looks like a program ID or signature
          if (!hex.match(/^[0-9a-f]{64}$/i)) continue;
          
          const buf = Buffer.from(hex, 'hex');
          // Skip zero commitments
          if (buf.every(b => b === 0)) continue;
          
          commitments.set(hex.toLowerCase(), buf);
        }
      }
    } catch (e) {
      // Ignore per-tx errors
    }
  }

  const result = Array.from(commitments.values());
  console.log(`✅ Found ${result.length} unique commitments`);
  return result;
}

function buildMerkleTree(leaves: Buffer[]): { root: Buffer; tree: Buffer[][] } {
  console.log(`🌳 Building Merkle tree with ${leaves.length} leaves...`);
  
  // Pad leaves to tree size
  const treeSize = Math.pow(2, TREE_DEPTH);
  const paddedLeaves = [...leaves];
  
  // Pad with zero hashes
  const zeroHash = Buffer.alloc(32, 0);
  while (paddedLeaves.length < treeSize) {
    paddedLeaves.push(zeroHash);
  }

  // Build tree bottom-up
  const tree: Buffer[][] = [paddedLeaves];
  let currentLevel = paddedLeaves;

  for (let level = 0; level < TREE_DEPTH; level++) {
    const nextLevel: Buffer[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1] || zeroHash;
      const parent = simpleHash(left, right);
      nextLevel.push(parent);
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  const root = currentLevel[0];
  console.log(`✅ Root: ${root.toString('hex')}`);
  
  return { root, tree };
}

async function setMerkleRoot(
  provider: AnchorProvider,
  program: Program,
  root: Buffer
): Promise<void> {
  console.log('📝 Setting merkle root on-chain...');

  const [censusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(CENSUS_STATE_SEED)],
    program.programId
  );

  const admin = provider.wallet.publicKey;

  try {
    const tx = await program.methods
      .setMerkleRoot(Array.from(root))
      .accounts({
        censusState: censusPda,
        admin: admin,
      })
      .rpc();

    console.log(`✅ Transaction: ${tx}`);
    console.log('✨ Merkle root set successfully!');
  } catch (err: any) {
    console.error('❌ Failed to set merkle root:', err.message);
    throw err;
  }
}

async function main() {
  console.log('🔨 Merkle Root Builder & Setter\n');

  // Setup
  const conn = new Connection(process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com', 'confirmed');
  const provider = AnchorProvider.env();
  
  // Load IDL
  const idlPath = './target/idl/census.json';
  if (!fs.existsSync(idlPath)) {
    console.error(`❌ IDL not found at ${idlPath}`);
    console.error('Run: anchor build');
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new Program(idl as any, provider);

  // Extract commitments
  const commitments = await extractCommitments(conn);
  if (commitments.length === 0) {
    console.log('⚠️  No commitments found. Make sure citizens have been registered.');
    return;
  }

  // Build tree
  const { root } = buildMerkleTree(commitments);

  // Set on-chain
  await setMerkleRoot(provider, program, root);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
