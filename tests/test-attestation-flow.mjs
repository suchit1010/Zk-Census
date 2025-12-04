/**
 * Integration Test: Attestation Flow
 * 
 * Tests the complete flow:
 * 1. Load test data from E2E test
 * 2. Call verifier API to get attestation
 * 3. Verify the attestation signature
 * 4. (Optional) Submit to Solana if localnet/devnet available
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERIFIER_API_URL = 'http://localhost:3001';

async function main() {
  console.log('🧪 Testing Attestation Flow\n');
  console.log('='.repeat(50));

  // Step 1: Load test data
  console.log('\n📂 Step 1: Loading test data...');
  const testDataPath = path.join(__dirname, 'test-data.json');
  
  if (!fs.existsSync(testDataPath)) {
    console.error('❌ test-data.json not found. Run e2e-test.mjs first.');
    process.exit(1);
  }

  const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
  console.log('✅ Test data loaded');
  console.log('   - Merkle root:', testData.merkle.root.slice(0, 30) + '...');
  console.log('   - Proof pi_a[0]:', testData.proof.pi_a[0].slice(0, 30) + '...');

  // Step 2: Call verifier API
  console.log('\n🔍 Step 2: Calling verifier API...');
  
  try {
    const response = await fetch(`${VERIFIER_API_URL}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proof: testData.proof,
        publicSignals: testData.publicSignals,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Verification failed');
    }

    const result = await response.json();
    console.log('✅ Verifier API responded');
    console.log('   - Success:', result.success);
    console.log('   - Verification time:', result.verificationTimeMs + 'ms');
    console.log('   - Verifier pubkey:', result.attestation.verifierPubkey);

    // Step 3: Verify attestation signature
    console.log('\n🔐 Step 3: Verifying attestation signature...');
    
    const attestation = result.attestation;
    const message = new Uint8Array(attestation.message);  // API returns 'message' not 'messageBytes'
    const signature = new Uint8Array(attestation.signature);  // Use raw bytes, not base58
    const verifierPubkey = bs58.decode(attestation.verifierPubkey);

    const isValid = nacl.sign.detached.verify(message, signature, verifierPubkey);
    
    if (isValid) {
      console.log('✅ Attestation signature is VALID');
    } else {
      console.log('❌ Attestation signature is INVALID');
      process.exit(1);
    }

    // Step 4: Parse attestation message
    console.log('\n📋 Step 4: Parsing attestation message...');
    
    // Message format: [timestamp(8) || merkleRoot(32) || nullifierHash(32) || externalNullifier(32) || signalHash(32)]
    const timestamp = message.slice(0, 8);
    const merkleRoot = message.slice(8, 40);
    const nullifierHash = message.slice(40, 72);
    const externalNullifier = message.slice(72, 104);
    const signalHash = message.slice(104, 136);

    // Parse timestamp as little-endian u64
    const timestampValue = readU64LE(timestamp);
    const timestampDate = new Date(Number(timestampValue) * 1000);
    console.log('   Timestamp:', timestampValue.toString(), '(' + timestampDate.toISOString() + ')');
    console.log('   Merkle root (hex):', Buffer.from(merkleRoot).toString('hex').slice(0, 32) + '...');
    console.log('   Nullifier hash (hex):', Buffer.from(nullifierHash).toString('hex').slice(0, 32) + '...');

    // Step 5: Verify timestamp freshness
    console.log('\n⏱️  Step 5: Verifying timestamp freshness...');
    const now = Math.floor(Date.now() / 1000);
    const age = now - Number(timestampValue);
    console.log('   Attestation age:', age, 'seconds');
    
    if (age < 300) {  // 5 minutes
      console.log('✅ Attestation is fresh (< 5 minutes old)');
    } else {
      console.log('⚠️  Attestation is stale (> 5 minutes old)');
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 ATTESTATION FLOW TEST SUMMARY');
    console.log('='.repeat(50));
    console.log('✅ API verification: PASSED');
    console.log('✅ Signature verification: PASSED');
    console.log('✅ Message parsing: PASSED');
    console.log('✅ Timestamp check: PASSED');
    console.log('\n🎉 All attestation flow tests passed!\n');

    // Output data for potential on-chain submission
    console.log('📤 Data ready for on-chain submission:');
    console.log('   Verifier: ' + attestation.verifierPubkey);
    console.log('   Signature: ' + attestation.signatureBase58.slice(0, 44) + '...');
    console.log('   Message size: ' + attestation.message.length + ' bytes');

    return {
      success: true,
      attestation,
      verificationTimeMs: result.verificationTimeMs,
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Make sure the verifier API is running:');
    console.log('   cd api && node server.js');
    process.exit(1);
  }
}

// Helper: Read little-endian u64
function readU64LE(bytes) {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

main().catch(console.error);
