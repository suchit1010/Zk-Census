const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const CENSUS_STATE_SEED = 'census_state';

async function main() {
  console.log('🔍 Setting merkle root on-chain...\n');

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/census.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  // Find census state PDA
  const [censusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(CENSUS_STATE_SEED)],
    PROGRAM_ID
  );

  console.log('📋 Transaction Details:');
  console.log('  Census State PDA:', censusPda.toBase58());
  console.log('  Admin:', provider.wallet.publicKey.toBase58());
  console.log('  Program ID:', PROGRAM_ID.toBase58());

  try {
    // Empty root (all zeros)
    const emptyRoot = Array(32).fill(0);
    
    console.log('\n⏳ Sending transaction...');
    const tx = await program.methods
      .setMerkleRoot(emptyRoot)
      .accounts({
        censusState: censusPda,
        admin: provider.wallet.publicKey,
      })
      .rpc({ 
        commitment: 'confirmed',
        maxRetries: 3,
      });

    console.log('\n✅ SUCCESS!');
    console.log('Transaction:', tx);
    console.log('\n✨ Merkle root set on-chain!');
    console.log('🎯 Frontend can now submit proofs.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.logs) {
      console.log('\nProgram logs:');
      error.logs.forEach(log => console.log('  ', log));
    }
    process.exit(1);
  }
}

main().catch(console.error);
