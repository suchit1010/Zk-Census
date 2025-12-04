const anchor = require('@coral-xyz/anchor');
const { PublicKey, Connection } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const CENSUS_STATE_SEED = 'census_state';

async function main() {
  console.log('🔍 Setting merkle root with proper Anchor deserialization...\n');

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL and create program - but skip account validation
  const idlPath = path.join(__dirname, '../target/idl/census.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  
  // Create minimal program just for method building
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  // Find census state PDA
  const [censusPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(CENSUS_STATE_SEED)],
    PROGRAM_ID
  );

  console.log('📋 Transaction Details:');
  console.log('  Census State PDA:', censusPda.toBase58());
  console.log('  Admin:', provider.wallet.publicKey.toBase58());
  console.log('  Bump:', bump);

  try {
    console.log('\n⏳ Calling set_merkle_root instruction...');
    
    // Use the program methods API - it handles everything
    const emptyRoot = Array(32).fill(0);
    
    const tx = await program.methods
      .setMerkleRoot(emptyRoot)
      .accounts({
        admin: provider.wallet.publicKey,
        censusState: censusPda,
      })
      .rpc({ 
        commitment: 'confirmed',
        maxRetries: 3,
        skipPreflight: false,
      });

    console.log('✅ Transaction signature:', tx);

    // Verify the root was set
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const accountInfo = await connection.getAccountInfo(censusPda);
    if (accountInfo) {
      const root = accountInfo.data.slice(32, 64);
      const isZero = root.every(b => b === 0);
      console.log('\n📊 Merkle root after transaction:');
      console.log('  Data:', root.toString('hex').substring(0, 16) + '...');
      console.log('  Status:', isZero ? '❌ Still zero!' : '✅ Updated!');
    }

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
