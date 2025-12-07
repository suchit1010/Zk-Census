/**
 * Check the on-chain admin for the Census program
 * Run: npx ts-node scripts/check-admin.ts
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

const CENSUS_PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const CENSUS_STATE_SEED = Buffer.from('census_state');

async function main() {
  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Derive census state PDA
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [CENSUS_STATE_SEED],
    CENSUS_PROGRAM_ID
  );
  
  console.log('🔍 Checking Census State...');
  console.log(`   Program ID: ${CENSUS_PROGRAM_ID.toBase58()}`);
  console.log(`   Census State PDA: ${censusStatePda.toBase58()}`);
  console.log('');
  
  try {
    // Fetch the account data
    const accountInfo = await connection.getAccountInfo(censusStatePda);
    
    if (!accountInfo) {
      console.log('❌ Census State account not found!');
      console.log('   The census has not been initialized yet.');
      console.log('   Run: anchor run initialize');
      return;
    }
    
    console.log('✅ Census State Account Found!');
    console.log(`   Data length: ${accountInfo.data.length} bytes`);
    console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
    console.log('');
    
    // Parse the account data manually
    // CensusState layout:
    // - 8 bytes: discriminator
    // - 32 bytes: admin pubkey
    // - 32 bytes: merkle_tree pubkey
    // - 32 bytes: merkle_root [u8; 32]
    // - 8 bytes: current_scope (u64)
    // - 8 bytes: scope_start_time (i64)
    // - 8 bytes: scope_duration (i64)
    // - 8 bytes: total_registered (u64)
    // - 8 bytes: current_population (u64)
    // - 8 bytes: leaf_count (u64)
    // - 1 byte: is_active (bool)
    // - 1 byte: bump (u8)
    
    const data = accountInfo.data;
    
    // Skip discriminator (8 bytes) and read admin (32 bytes)
    const adminBytes = data.slice(8, 40);
    const admin = new PublicKey(adminBytes);
    
    // Read merkle tree pubkey
    const merkleTreeBytes = data.slice(40, 72);
    const merkleTree = new PublicKey(merkleTreeBytes);
    
    // Read merkle root
    const merkleRoot = data.slice(72, 104);
    const merkleRootHex = Buffer.from(merkleRoot).toString('hex');
    
    // Read scope
    const currentScope = data.readBigUInt64LE(104);
    const scopeStartTime = data.readBigInt64LE(112);
    const scopeDuration = data.readBigInt64LE(120);
    
    // Read counters
    const totalRegistered = data.readBigUInt64LE(128);
    const currentPopulation = data.readBigUInt64LE(136);
    const leafCount = data.readBigUInt64LE(144);
    
    // Read flags
    const isActive = data[152] === 1;
    const bump = data[153];
    
    console.log('📊 Census State Data:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   🔑 ADMIN: ${admin.toBase58()}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   Merkle Tree: ${merkleTree.toBase58()}`);
    console.log(`   Merkle Root: ${merkleRootHex.slice(0, 32)}...`);
    console.log(`   Current Scope: ${currentScope}`);
    console.log(`   Scope Start: ${new Date(Number(scopeStartTime) * 1000).toISOString()}`);
    console.log(`   Scope Duration: ${scopeDuration} seconds`);
    console.log(`   Total Registered: ${totalRegistered}`);
    console.log(`   Current Population: ${currentPopulation}`);
    console.log(`   Leaf Count: ${leafCount}`);
    console.log(`   Is Active: ${isActive}`);
    console.log(`   Bump: ${bump}`);
    console.log('');
    
    // Check local wallet
    const walletPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.config', 'solana', 'id.json');
    try {
      const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
      const walletKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletData));
      const localWallet = walletKeypair.publicKey;
      
      console.log('🔑 Your Local Wallet:');
      console.log(`   ${localWallet.toBase58()}`);
      console.log('');
      
      if (localWallet.equals(admin)) {
        console.log('✅ Your wallet IS the admin - you can register citizens!');
      } else {
        console.log('❌ Your wallet is NOT the admin!');
        console.log('');
        console.log('📋 To fix this, you have two options:');
        console.log('');
        console.log('   Option 1: Use the admin wallet');
        console.log(`   - Switch to wallet: ${admin.toBase58()}`);
        console.log('');
        console.log('   Option 2: Re-initialize with your current wallet');
        console.log('   - This will reset all data!');
        console.log('   - Run: anchor run initialize');
      }
    } catch (e) {
      console.log('⚠️ Could not load local wallet to compare');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main().catch(console.error);
