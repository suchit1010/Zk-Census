#!/usr/bin/env npx ts-node
/**
 * Setup script to:
 * 1. Export commitments from on-chain events
 * 2. Build Merkle tree
 * 3. Set merkle root on-chain
 *
 * Usage: export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *        export ANCHOR_WALLET=/home/user/.config/solana/id.json
 *        npx ts-node scripts/setup-merkle-root.ts
 */

import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import * as fs from 'fs';

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const ADMIN = new PublicKey('3rqrdZaNqMtczK5LHeDNLTEx84xUyCpGtKvFYE5b9SvQ');

async function exportCommitments(): Promise<string[]> {
  console.log('\n📤 Step 1: Exporting commitments from on-chain events...');
  
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 1000 });
  
  const commitments = new Set<string>();
  
  for (const sig of sigs) {
    try {
      const tx = await conn.getTransaction(sig.signature, { commitment: 'confirmed' });
      if (!tx || !tx.meta) continue;
      
      const logs = tx.meta.logMessages || [];
      for (const log of logs) {
        // Look for 64-char hex strings (32 bytes in hex)
        const hexMatches = Array.from(log.matchAll(/\b([0-9a-f]{64})\b/gi));
        for (const match of hexMatches) {
          const hex = match[1].toLowerCase();
          // Skip all-zeros
          if (!/^0+$/.test(hex)) {
            commitments.add(hex);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
  
  const commitmentArray = Array.from(commitments).sort();
  console.log(`  ✅ Found ${commitmentArray.length} unique commitments`);
  
  // Save for reference
  fs.writeFileSync('commitments.json', JSON.stringify(
    commitmentArray.map((hex, idx) => ({ index: idx, commitment: hex })),
    null,
    2
  ));
  
  return commitmentArray;
}

async function computeMerkleRoot(commitments: string[]): Promise<{ root: string; tree: any }> {
  console.log('\n🌳 Step 2: Computing Merkle tree...');
  
  if (commitments.length === 0) {
    console.log('  ⚠️  No commitments found, using empty tree');
    return { root: '00'.repeat(32), tree: {} };
  }
  
  // For now, use a simple approach: hash commitments together
  // In production, this should use the exact same Poseidon hasher as the circuit
  const crypto = require('crypto');
  
  // Sort and hash
  let hash = Buffer.from(commitments[0], 'hex');
  for (let i = 1; i < commitments.length; i++) {
    const left = hash;
    const right = Buffer.from(commitments[i], 'hex');
    const combined = Buffer.concat([left, right]);
    hash = crypto.createHash('sha256').update(combined).digest();
  }
  
  const root = hash.toString('hex');
  console.log(`  ✅ Merkle root: ${root.slice(0, 16)}...`);
  
  return { root, tree: { commitments } };
}

async function setMerkleRoot(provider: AnchorProvider, root: string): Promise<void> {
  console.log('\n⚙️  Step 3: Setting merkle root on-chain...');
  console.log(`  Root: ${root.slice(0, 16)}...`);
  
  // Create the instruction to set merkle root
  // Note: This requires the program to have a set_merkle_root instruction
  // For now, we'll just log what needs to happen
  
  console.log('\n  ⚠️  INFO: Your program does NOT have a set_merkle_root instruction yet.');
  console.log('  You need to add this instruction to the program:');
  console.log(`
  pub fn set_merkle_root(ctx: Context<SetMerkleRoot>, root: [u8; 32]) -> Result<()> {
      let census_state = &mut ctx.accounts.census_state;
      census_state.merkle_root = root;
      Ok(())
  }
  `);
  console.log('\n  To proceed:');
  console.log('  1. Add set_merkle_root instruction to programs/census/src/instructions/');
  console.log('  2. Update programs/census/src/lib.rs to include the instruction');
  console.log('  3. Rebuild: anchor build');
  console.log('  4. Redeploy: anchor deploy');
  console.log('  5. Run this script again');
}

async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔧 zk-Census Merkle Root Setup');
    console.log('═══════════════════════════════════════════════════════════════');
    
    // Step 1: Export commitments
    const commitments = await exportCommitments();
    
    // Step 2: Compute merkle root
    const { root } = await computeMerkleRoot(commitments);
    
    // Step 3: Set on-chain (requires program update)
    const provider = AnchorProvider.env();
    await setMerkleRoot(provider, root);
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📋 Summary:');
    console.log(`  Commitments found: ${commitments.length}`);
    console.log(`  Computed root: ${root}`);
    console.log(`  Status: Waiting for set_merkle_root instruction`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
