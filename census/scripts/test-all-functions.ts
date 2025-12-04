/**
 * Comprehensive functionality test for zk-census
 * Tests all major functions end-to-end
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Census } from "../target/types/census";
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const RPC_URL = 'https://api.devnet.solana.com';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

async function main() {
  console.log('🧪 Starting Comprehensive Function Tests\n');
  console.log('=' .repeat(60));
  
  const results: TestResult[] = [];
  
  // Setup
  const connection = new Connection(RPC_URL, 'confirmed');
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Census as Program<Census>;
  const admin = provider.wallet;

  console.log('\n📋 Configuration:');
  console.log('  Program ID:', PROGRAM_ID.toBase58());
  console.log('  RPC URL:', RPC_URL);
  console.log('  Admin:', admin.publicKey.toBase58());

  // Test 1: Check program exists
  console.log('\n' + '='.repeat(60));
  console.log('Test 1: Check Program Deployment');
  console.log('='.repeat(60));
  try {
    const programInfo = await connection.getAccountInfo(PROGRAM_ID);
    if (programInfo) {
      console.log('✅ Program account exists');
      console.log('  Data length:', programInfo.data.length, 'bytes');
      console.log('  Owner:', programInfo.owner.toBase58());
      results.push({ name: 'Program Deployment', passed: true });
    } else {
      throw new Error('Program account not found');
    }
  } catch (err: any) {
    console.error('❌ Program check failed:', err.message);
    results.push({ name: 'Program Deployment', passed: false, error: err.message });
  }

  // Test 2: Check census state
  console.log('\n' + '='.repeat(60));
  console.log('Test 2: Check Census State Initialization');
  console.log('='.repeat(60));
  try {
    const [censusStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('census_state')],
      PROGRAM_ID
    );
    console.log('  Census State PDA:', censusStatePda.toBase58());

    const censusState = await program.account.censusState.fetch(censusStatePda);
    console.log('✅ Census state found:');
    console.log('  Admin:', censusState.admin.toBase58());
    console.log('  Current Scope:', censusState.currentScope.toString());
    console.log('  Current Population:', censusState.currentPopulation.toString());
    console.log('  Total Registered:', censusState.totalRegistered.toString());
    console.log('  Leaf Count:', censusState.leafCount.toString());
    console.log('  Is Active:', censusState.isActive);
    console.log('  Merkle Root:', Buffer.from(censusState.merkleRoot).toString('hex').slice(0, 32) + '...');
    
    results.push({ 
      name: 'Census State Initialization', 
      passed: true,
      details: {
        scope: censusState.currentScope.toString(),
        population: censusState.currentPopulation.toString(),
        registered: censusState.totalRegistered.toString(),
      }
    });
  } catch (err: any) {
    console.error('❌ Census state check failed:', err.message);
    results.push({ name: 'Census State Initialization', passed: false, error: err.message });
  }

  // Test 3: Check circuit files exist
  console.log('\n' + '='.repeat(60));
  console.log('Test 3: Check ZK Circuit Files');
  console.log('='.repeat(60));
  try {
    const circuitDir = path.join(__dirname, '..', 'app', 'public', 'circuits');
    const wasmPath = path.join(circuitDir, 'census.wasm');
    const zkeyPath = path.join(circuitDir, 'census_final.zkey');
    const vkeyPath = path.join(circuitDir, 'verification_key.json');

    const wasmExists = fs.existsSync(wasmPath);
    const zkeyExists = fs.existsSync(zkeyPath);
    const vkeyExists = fs.existsSync(vkeyPath);

    console.log('  census.wasm:', wasmExists ? '✅ Found' : '❌ Missing');
    console.log('  census_final.zkey:', zkeyExists ? '✅ Found' : '❌ Missing');
    console.log('  verification_key.json:', vkeyExists ? '✅ Found' : '❌ Missing');

    if (wasmExists) {
      const wasmSize = fs.statSync(wasmPath).size;
      console.log('    Size:', (wasmSize / 1024 / 1024).toFixed(2), 'MB');
    }
    if (zkeyExists) {
      const zkeySize = fs.statSync(zkeyPath).size;
      console.log('    Size:', (zkeySize / 1024 / 1024).toFixed(2), 'MB');
    }

    if (wasmExists && zkeyExists && vkeyExists) {
      results.push({ name: 'ZK Circuit Files', passed: true });
    } else {
      throw new Error('Missing circuit files');
    }
  } catch (err: any) {
    console.error('❌ Circuit files check failed:', err.message);
    results.push({ name: 'ZK Circuit Files', passed: false, error: err.message });
  }

  // Test 4: Check admin balance
  console.log('\n' + '='.repeat(60));
  console.log('Test 4: Check Admin Wallet');
  console.log('='.repeat(60));
  try {
    const balance = await connection.getBalance(admin.publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    console.log('  Admin address:', admin.publicKey.toBase58());
    console.log('  Balance:', solBalance.toFixed(4), 'SOL');
    
    if (balance > 0) {
      console.log('✅ Admin wallet funded');
      results.push({ name: 'Admin Wallet', passed: true, details: { balance: solBalance } });
    } else {
      throw new Error('Admin wallet has no SOL');
    }
  } catch (err: any) {
    console.error('❌ Admin wallet check failed:', err.message);
    results.push({ name: 'Admin Wallet', passed: false, error: err.message });
  }

  // Test 5: Check if scope is active
  console.log('\n' + '='.repeat(60));
  console.log('Test 5: Check Census Scope Status');
  console.log('='.repeat(60));
  try {
    const [censusStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('census_state')],
      PROGRAM_ID
    );
    const censusState = await program.account.censusState.fetch(censusStatePda);
    
    const scopeStart = censusState.scopeStart.toNumber();
    const scopeDuration = censusState.scopeDuration.toNumber();
    const scopeEnd = scopeStart + scopeDuration;
    const now = Math.floor(Date.now() / 1000);
    
    const startDate = new Date(scopeStart * 1000);
    const endDate = new Date(scopeEnd * 1000);
    const currentDate = new Date(now * 1000);
    
    console.log('  Scope start:', startDate.toISOString());
    console.log('  Scope end:', endDate.toISOString());
    console.log('  Current time:', currentDate.toISOString());
    console.log('  Scope duration:', scopeDuration / 86400, 'days');
    
    const isExpired = now > scopeEnd;
    if (isExpired) {
      console.log('⚠️  Scope is EXPIRED');
      console.log('  Expired', ((now - scopeEnd) / 86400).toFixed(2), 'days ago');
      results.push({ 
        name: 'Census Scope Status', 
        passed: false, 
        error: 'Scope expired - needs admin to advance',
        details: { expired: true }
      });
    } else {
      console.log('✅ Scope is ACTIVE');
      console.log('  Time remaining:', ((scopeEnd - now) / 86400).toFixed(2), 'days');
      results.push({ 
        name: 'Census Scope Status', 
        passed: true,
        details: { timeRemaining: (scopeEnd - now) / 86400 }
      });
    }
  } catch (err: any) {
    console.error('❌ Scope status check failed:', err.message);
    results.push({ name: 'Census Scope Status', passed: false, error: err.message });
  }

  // Test 6: Check Merkle root
  console.log('\n' + '='.repeat(60));
  console.log('Test 6: Check Merkle Root');
  console.log('='.repeat(60));
  try {
    const [censusStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('census_state')],
      PROGRAM_ID
    );
    const censusState = await program.account.censusState.fetch(censusStatePda);
    
    const rootHex = Buffer.from(censusState.merkleRoot).toString('hex');
    console.log('  Merkle root:', rootHex.slice(0, 64) + '...');
    
    const isZero = rootHex === '0'.repeat(64);
    if (isZero) {
      console.log('⚠️  Merkle root is all zeros');
      console.log('  This means no commitments have been registered on-chain');
      console.log('  Proofs will FAIL until root is set by admin');
      results.push({ 
        name: 'Merkle Root', 
        passed: false, 
        error: 'Root is zero - needs admin to set root',
        details: { isZero: true }
      });
    } else {
      console.log('✅ Merkle root is set');
      results.push({ name: 'Merkle Root', passed: true });
    }
  } catch (err: any) {
    console.error('❌ Merkle root check failed:', err.message);
    results.push({ name: 'Merkle Root', passed: false, error: err.message });
  }

  // Test 7: Check frontend app
  console.log('\n' + '='.repeat(60));
  console.log('Test 7: Check Frontend Application');
  console.log('='.repeat(60));
  try {
    const appDir = path.join(__dirname, '..', 'app');
    const packageJsonPath = path.join(appDir, 'package.json');
    const indexPath = path.join(appDir, 'src', 'pages', 'index.tsx');
    const proveButtonPath = path.join(appDir, 'src', 'components', 'ProveButton.tsx');
    
    const packageJsonExists = fs.existsSync(packageJsonPath);
    const indexExists = fs.existsSync(indexPath);
    const proveButtonExists = fs.existsSync(proveButtonPath);
    
    console.log('  package.json:', packageJsonExists ? '✅' : '❌');
    console.log('  index.tsx:', indexExists ? '✅' : '❌');
    console.log('  ProveButton.tsx:', proveButtonExists ? '✅' : '❌');
    
    if (packageJsonExists && indexExists && proveButtonExists) {
      console.log('✅ Frontend files present');
      results.push({ name: 'Frontend Application', passed: true });
    } else {
      throw new Error('Missing frontend files');
    }
  } catch (err: any) {
    console.error('❌ Frontend check failed:', err.message);
    results.push({ name: 'Frontend Application', passed: false, error: err.message });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`\nTotal Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  console.log('\n📋 Detailed Results:\n');
  results.forEach((result, i) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${i + 1}. ${icon} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.details) {
      console.log(`   Details:`, JSON.stringify(result.details, null, 2));
    }
  });

  // Critical Issues
  const criticalIssues = results.filter(r => !r.passed);
  if (criticalIssues.length > 0) {
    console.log('\n⚠️  CRITICAL ISSUES TO FIX:\n');
    criticalIssues.forEach((issue, i) => {
      console.log(`${i + 1}. ${issue.name}: ${issue.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test completed');
  console.log('='.repeat(60) + '\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
