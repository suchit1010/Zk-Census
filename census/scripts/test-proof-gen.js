// Test ZK proof generation locally
const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

async function testProofGeneration() {
  console.log('🧪 Testing ZK Proof Generation...\n');

  // Paths to circuit files
  const wasmPath = path.join(__dirname, '../app/public/circuits/census.wasm');
  const zkeyPath = path.join(__dirname, '../app/public/circuits/census_final.zkey');

  console.log('📂 Circuit files:');
  console.log('  WASM:', wasmPath);
  console.log('  zKey:', zkeyPath);

  // Test inputs (mock identity for testing)
  const TREE_DEPTH = 20;
  
  const inputs = {
    identityNullifier: '1234567890',
    identityTrapdoor: '9876543210',
    treePathIndices: Array(TREE_DEPTH).fill(0),
    treeSiblings: Array(TREE_DEPTH).fill('0'),
    signalHash: '1', // "I'm alive"
    externalNullifier: '2', // Current scope
  };

  console.log('\n🔐 Generating proof...');
  console.time('Proof generation');

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      wasmPath,
      zkeyPath
    );

    console.timeEnd('Proof generation');
    console.log('\n✅ Proof generated successfully!');
    
    console.log('\n📊 Proof components:');
    console.log('  pi_a:', proof.pi_a.map(x => x.slice(0, 20) + '...'));
    console.log('  pi_b:', proof.pi_b.map(coords => coords.map(x => x.slice(0, 20) + '...')));
    console.log('  pi_c:', proof.pi_c.map(x => x.slice(0, 20) + '...'));
    
    console.log('\n📊 Public signals:');
    publicSignals.forEach((sig, i) => {
      const names = ['root', 'nullifierHash', 'signalHash', 'externalNullifier'];
      console.log(`  ${names[i]}: ${sig.slice(0, 20)}...`);
    });

    // Verify proof locally
    console.log('\n🔍 Verifying proof locally...');
    const vkeyPath = path.join(__dirname, '../app/public/circuits/verification_key.json');
    const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
    
    const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    console.log('  Valid:', isValid ? '✅ YES' : '❌ NO');

    if (isValid) {
      console.log('\n🎉 Success! Proof generation works correctly.');
      console.log('   Now we can use this in the browser.');
    }

  } catch (err) {
    console.error('\n❌ Proof generation failed:', err.message);
    console.error('   Stack:', err.stack);
  }
}

testProofGeneration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
