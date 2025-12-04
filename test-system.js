#!/usr/bin/env node

const { Connection, PublicKey } = require('@solana/web3.js');
const fetch = require('node-fetch');

const PROGRAM_ID = '9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH';
const RPC = 'https://api.devnet.solana.com';

async function testSystem() {
  console.log('🧪 Testing zk-Census System...\n');

  // Test 1: RPC Connection
  console.log('1️⃣ Testing Solana RPC connection...');
  try {
    const connection = new Connection(RPC, 'confirmed');
    const version = await connection.getVersion();
    console.log(`   ✅ Connected to Solana ${version['solana-core']}`);
  } catch (err) {
    console.log(`   ❌ RPC connection failed: ${err.message}`);
    return;
  }

  // Test 2: Program Exists
  console.log('\n2️⃣ Checking if program is deployed...');
  try {
    const connection = new Connection(RPC, 'confirmed');
    const programId = new PublicKey(PROGRAM_ID);
    const accountInfo = await connection.getAccountInfo(programId);
    if (accountInfo) {
      console.log(`   ✅ Program found (${accountInfo.data.length} bytes)`);
    } else {
      console.log(`   ❌ Program not found`);
      return;
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return;
  }

  // Test 3: Census State PDA
  console.log('\n3️⃣ Checking Census State PDA...');
  try {
    const connection = new Connection(RPC, 'confirmed');
    const [censusStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('census_state')],
      new PublicKey(PROGRAM_ID)
    );
    const accountInfo = await connection.getAccountInfo(censusStatePda);
    if (accountInfo) {
      console.log(`   ✅ Census State PDA exists`);
      console.log(`   📊 Size: ${accountInfo.data.length} bytes`);
      
      // Parse basic info
      const totalRegistered = readU64(accountInfo.data, 128);
      const currentPopulation = readU64(accountInfo.data, 136);
      console.log(`   👥 Total Registered: ${totalRegistered}`);
      console.log(`   ✅ Current Population: ${currentPopulation}`);
    } else {
      console.log(`   ❌ Census State not initialized`);
      console.log(`   💡 Run: cd scripts && node initialize.ts`);
      return;
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return;
  }

  // Test 4: API Server
  console.log('\n4️⃣ Testing API server...');
  try {
    const response = await fetch('http://localhost:4000/health');
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ API server is running`);
      console.log(`   🌳 Tree leaves: ${data.leafCount}`);
    } else {
      console.log(`   ❌ API server returned ${response.status}`);
      console.log(`   💡 Start with: cd indexer && node api.js`);
    }
  } catch (err) {
    console.log(`   ❌ API server not reachable`);
    console.log(`   💡 Start with: cd indexer && node api.js`);
  }

  // Test 5: Frontend
  console.log('\n5️⃣ Testing frontend...');
  try {
    const response = await fetch('http://localhost:3000');
    if (response.ok) {
      console.log(`   ✅ Frontend is running`);
    } else {
      console.log(`   ❌ Frontend returned ${response.status}`);
    }
  } catch (err) {
    console.log(`   ❌ Frontend not reachable`);
    console.log(`   💡 Start with: cd census/app && npm run dev`);
  }

  console.log('\n✅ System check complete!');
  console.log('\n📋 Next Steps:');
  console.log('   1. Start indexer: cd indexer && node indexer.js');
  console.log('   2. Start API: cd indexer && node api.js');
  console.log('   3. Start frontend: cd census/app && npm run dev');
  console.log('   4. Open http://localhost:3000');
}

function readU64(buffer, offset) {
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result += BigInt(buffer[offset + i]) << BigInt(i * 8);
  }
  return result;
}

testSystem().catch(console.error);
