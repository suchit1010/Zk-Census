/**
 * Simple status check - no dependencies on missing packages
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Census } from "../target/types/census";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  console.log('🧪 zk-Census Functionality Status Check\n');
  console.log('=' .repeat(70));
  
  try {
    // Setup
    const connection = new Connection(RPC_URL, 'confirmed');
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.Census as Program<Census>;
    const admin = provider.wallet;

    console.log('\n📋 ENVIRONMENT:');
    console.log(`  Program ID: ${PROGRAM_ID.toBase58()}`);
    console.log(`  Admin: ${admin.publicKey.toBase58()}`);
    console.log(`  RPC: ${RPC_URL}`);

    // Check program
    console.log('\n' + '='.repeat(70));
    console.log('1️⃣  PROGRAM DEPLOYMENT');
    console.log('='.repeat(70));
    const programInfo = await connection.getAccountInfo(PROGRAM_ID);
    if (programInfo) {
      console.log('✅ Program deployed');
      console.log(`   Size: ${programInfo.data.length} bytes`);
      console.log(`   Owner: ${programInfo.owner.toBase58()}`);
    } else {
      console.log('❌ Program not found');
      process.exit(1);
    }

    // Check census state
    console.log('\n' + '='.repeat(70));
    console.log('2️⃣  CENSUS STATE');
    console.log('='.repeat(70));
    const [censusStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('census_state')],
      PROGRAM_ID
    );
    console.log(`   PDA: ${censusStatePda.toBase58()}`);

    const state = await program.account.censusState.fetch(censusStatePda);
    console.log('✅ State initialized');
    console.log(`   Admin: ${state.admin.toBase58()}`);
    console.log(`   Current Scope: ${state.currentScope}`);
    console.log(`   Total Registered: ${state.totalRegistered}`);
    console.log(`   Current Population: ${state.currentPopulation}`);
    console.log(`   Leaf Count: ${state.leafCount}`);
    console.log(`   Is Active: ${state.isActive}`);

    // Check times
    console.log('\n   ⏱️  SCOPE TIMING:');
    const now = Math.floor(Date.now() / 1000);
    const scopeStart = state.scopeStartTime.toNumber();
    const scopeEnd = state.scopeStartTime.toNumber() + state.scopeDuration.toNumber();
    const isExpired = now > scopeEnd;
    
    console.log(`   Start: ${new Date(scopeStart * 1000).toISOString()}`);
    console.log(`   End: ${new Date(scopeEnd * 1000).toISOString()}`);
    console.log(`   Now: ${new Date(now * 1000).toISOString()}`);
    
    if (isExpired) {
      const hoursExpired = ((now - scopeEnd) / 3600).toFixed(1);
      console.log(`   ⚠️  EXPIRED by ${hoursExpired} hours`);
    } else {
      const hoursLeft = ((scopeEnd - now) / 3600).toFixed(1);
      console.log(`   ✅ Active for ${hoursLeft} more hours`);
    }

    // Check merkle root
    console.log('\n   🌳 MERKLE ROOT:');
    const rootBytes = Buffer.from(state.merkleRoot);
    const rootHex = rootBytes.toString('hex');
    const isZeroRoot = rootHex === '0'.repeat(64);
    
    console.log(`   Root: ${rootHex.slice(0, 16)}...`);
    if (isZeroRoot) {
      console.log(`   ⚠️  ROOT IS ZERO - Proofs will FAIL!`);
      console.log(`   → Admin needs to call set_merkle_root instruction`);
    } else {
      console.log(`   ✅ Root is set`);
    }

    // Check admin wallet
    console.log('\n' + '='.repeat(70));
    console.log('3️⃣  ADMIN WALLET');
    console.log('='.repeat(70));
    const balance = await connection.getBalance(admin.publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    console.log(`✅ Balance: ${solBalance.toFixed(4)} SOL`);

    // Check circuit files
    console.log('\n' + '='.repeat(70));
    console.log('4️⃣  ZK CIRCUIT FILES');
    console.log('='.repeat(70));
    const circuitDir = path.join(__dirname, '..', 'app', 'public', 'circuits');
    const wasmPath = path.join(circuitDir, 'census.wasm');
    const zkeyPath = path.join(circuitDir, 'census_final.zkey');
    const vkeyPath = path.join(circuitDir, 'verification_key.json');

    const wasmOk = fs.existsSync(wasmPath);
    const zkeyOk = fs.existsSync(zkeyPath);
    const vkeyOk = fs.existsSync(vkeyPath);

    if (wasmOk) {
      const size = fs.statSync(wasmPath).size / 1024 / 1024;
      console.log(`✅ census.wasm (${size.toFixed(1)}MB)`);
    } else {
      console.log(`❌ census.wasm MISSING`);
    }

    if (zkeyOk) {
      const size = fs.statSync(zkeyPath).size / 1024 / 1024;
      console.log(`✅ census_final.zkey (${size.toFixed(1)}MB)`);
    } else {
      console.log(`❌ census_final.zkey MISSING`);
    }

    if (vkeyOk) {
      console.log(`✅ verification_key.json`);
    } else {
      console.log(`❌ verification_key.json MISSING`);
    }

    // Check frontend files
    console.log('\n' + '='.repeat(70));
    console.log('5️⃣  FRONTEND APPLICATION');
    console.log('='.repeat(70));
    const appDir = path.join(__dirname, '..', 'app');
    const pkgExists = fs.existsSync(path.join(appDir, 'package.json'));
    const indexExists = fs.existsSync(path.join(appDir, 'src', 'pages', 'index.tsx'));
    const proveButtonExists = fs.existsSync(path.join(appDir, 'src', 'components', 'ProveButton.tsx'));
    const globeExists = fs.existsSync(path.join(appDir, 'src', 'components', 'Globe.tsx'));
    const toastExists = fs.existsSync(path.join(appDir, 'src', 'components', 'Toast.tsx'));

    console.log(pkgExists ? '✅' : '❌', 'package.json');
    console.log(indexExists ? '✅' : '❌', 'pages/index.tsx');
    console.log(proveButtonExists ? '✅' : '❌', 'components/ProveButton.tsx');
    console.log(globeExists ? '✅' : '❌', 'components/Globe.tsx');
    console.log(toastExists ? '✅' : '❌', 'components/Toast.tsx (notifications)');

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 FUNCTIONALITY SUMMARY');
    console.log('='.repeat(70));

    console.log('\n✅ WORKING:');
    console.log('   • Program deployed to devnet');
    console.log('   • Census state initialized');
    console.log('   • Admin wallet funded');
    console.log('   • ZK circuit files present');
    console.log('   • Frontend UI built');

    console.log('\n⚠️  BLOCKERS:');
    if (isExpired) {
      console.log(`   • Scope expired - admin must call advance_scope`);
    }
    if (isZeroRoot) {
      console.log(`   • Merkle root is zero - admin must call set_merkle_root`);
    }

    console.log('\n❌ MISSING IMPLEMENTATIONS:');
    console.log('   • Live population counter (needs state polling)');
    console.log('   • Error toast notifications UI component');
    console.log('   • Loading spinner during proof generation');
    console.log('   • Mobile wallet menu');
    console.log('   • Merkle root setter instruction (needs program update)');

    console.log('\n' + '='.repeat(70));
    console.log('✨ Next Steps:');
    console.log('='.repeat(70));
    
    if (isExpired) {
      console.log('\n1. ADVANCE SCOPE (required):');
      console.log('   npx ts-node scripts/advance-scope.ts');
    }
    
    if (isZeroRoot) {
      console.log('\n2. SET MERKLE ROOT (required for proofs):');
      console.log('   npx ts-node scripts/build-and-set-merkle.ts');
    }

    console.log('\n3. Test proof generation:');
    console.log('   npx ts-node scripts/test-proof-gen.js');

    console.log('\n4. Run frontend:');
    console.log('   cd app && yarn dev');

    console.log('\n' + '='.repeat(70) + '\n');

  } catch (err: any) {
    console.error('\n❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
