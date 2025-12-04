import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Connection } from '@solana/web3.js';
import { poseidonHash } from 'circomlibjs';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = '9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH';
const CENSUS_STATE_SEED = 'census_state';
const TREE_DEPTH = 20;

interface MerkleNode {
  hash: bigint;
  left?: MerkleNode;
  right?: MerkleNode;
}

/**
 * Extract commitments from on-chain events/logs
 */
async function extractCommitments(): Promise<string[]> {
  const connection = new Connection('https://api.devnet.solana.com');
  const provider = anchor.AnchorProvider.env();
  
  const [censusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(CENSUS_STATE_SEED)],
    new PublicKey(PROGRAM_ID)
  );

  console.log('📊 Extracting commitments from on-chain events...');
  console.log('Census State PDA:', censusPda.toBase58());

  // Get the account info
  const account = await connection.getAccountInfo(censusPda);
  if (!account) {
    throw new Error('Census state account not found');
  }

  console.log('✅ Found census state account');
  
  // For now, return empty array - we'll get commitments from another source
  // In a real implementation, we'd parse events or use a commitment store
  return [];
}

/**
 * Build merkle tree from commitments using Poseidon hash
 */
async function buildMerkleTree(commitments: bigint[]): Promise<{ root: bigint; tree: MerkleNode }> {
  console.log(`🌳 Building merkle tree from ${commitments.length} commitments...`);
  
  // Pad commitments to power of 2
  let leaves = [...commitments];
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(commitments.length)));
  const zero = 0n;
  
  while (leaves.length < nextPowerOf2) {
    leaves.push(zero);
  }

  console.log(`Padded to ${leaves.length} leaves`);

  // Convert to nodes
  let nodes: MerkleNode[] = leaves.map(hash => ({ hash }));

  // Build tree bottom-up
  let level = 0;
  while (nodes.length > 1) {
    console.log(`Level ${level}: ${nodes.length} nodes`);
    const nextLevel: MerkleNode[] = [];

    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1];
      
      // Poseidon hash of [left, right]
      const parentHash = await poseidonHash([left.hash, right.hash]);
      
      nextLevel.push({
        hash: BigInt(parentHash),
        left,
        right,
      });
    }

    nodes = nextLevel;
    level++;
  }

  const root = nodes[0];
  console.log(`✅ Tree built with root: ${root.hash.toString(16)}`);
  
  return { root: root.hash, tree: root };
}

/**
 * Set merkle root on-chain
 */
async function setMerkleRootOnChain(root: bigint): Promise<string> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/census.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new anchor.Program(idl as any, new PublicKey(PROGRAM_ID), provider);

  // Find census state PDA
  const [censusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(CENSUS_STATE_SEED)],
    new PublicKey(PROGRAM_ID)
  );

  console.log('\n🔐 Setting merkle root on-chain...');
  console.log('Root:', root.toString(16));
  console.log('Census State PDA:', censusPda.toBase58());

  try {
    // Convert root to bytes
    const rootBytes = Array.from(root.toString(16).padStart(64, '0').match(/.{1,2}/g)!.map(x => parseInt(x, 16)));
    
    // Call set_merkle_root instruction
    const tx = await program.methods
      .setMerkleRoot(rootBytes)
      .accounts({
        censusState: censusPda,
        admin: provider.wallet.publicKey,
      })
      .rpc();

    console.log('✅ Transaction sent:', tx);
    return tx;
  } catch (error) {
    console.error('❌ Error setting merkle root:', error);
    throw error;
  }
}

async function main() {
  try {
    // Step 1: Extract commitments from chain
    const commitments = await extractCommitments();
    console.log(`Found ${commitments.length} commitments`);

    // For demo: use empty tree (all zeros)
    const demoCommitments: bigint[] = Array(9).fill(0n);
    
    // Step 2: Build merkle tree
    const { root } = await buildMerkleTree(demoCommitments);

    // Step 3: Set on-chain
    const tx = await setMerkleRootOnChain(root);
    
    console.log('\n✨ Merkle root successfully set!');
    console.log('Transaction:', tx);
    console.log('\n🎉 You can now generate and verify proofs!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
