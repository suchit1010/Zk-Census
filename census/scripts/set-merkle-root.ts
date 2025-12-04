import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Connection, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const CENSUS_STATE_SEED = 'census_state';

async function main() {
  console.log('🔍 Setting up merkle root for proof verification...\n');

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/census.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`IDL not found at ${idlPath}`);
  }
  
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new anchor.Program(idl as any, PROGRAM_ID, provider);

  // Find census state PDA
  const [censusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(CENSUS_STATE_SEED)],
    PROGRAM_ID
  );

  console.log('📊 Current Census State:');
  console.log('  Census State PDA:', censusPda.toBase58());
  
  console.log('\n🎯 Setting merkle root...');
  console.log('  Admin:', provider.wallet.publicKey.toBase58());
  console.log('  Program ID:', PROGRAM_ID.toBase58());

  try {
    // Use empty tree root (all zeros)
    const emptyRoot = Array(32).fill(0);
    
    const tx = await (program.methods as any)
      .setMerkleRoot(emptyRoot)
      .accounts({
        censusState: censusPda,
        admin: provider.wallet.publicKey,
      })
      .rpc({ 
        commitment: 'confirmed',
        maxRetries: 3,
      });

    console.log('\n✅ Success!');
    console.log('  Transaction:', tx);
    console.log('\n✨ Merkle root has been set on-chain!');
    console.log('📝 Frontend can now submit proofs successfully.');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.logs) {
      console.error('\nProgram logs:');
      error.logs.forEach((log: string) => console.error('  ', log));
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
