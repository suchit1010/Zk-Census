import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNLTEx84xUyCpGtKvFYE5b9SvH');
const CENSUS_STATE_SEED = 'census_state';

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/census.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new anchor.Program(idl as any, new PublicKey(PROGRAM_ID), provider);

  // Find census state PDA
  const [censusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(CENSUS_STATE_SEED)],
    PROGRAM_ID
  );

  console.log('🔄 Setting merkle root to computed value...');
  console.log('Census State PDA:', censusPda.toBase58());
  console.log('Admin:', provider.wallet.publicKey.toBase58());

  try {
    // For now, use an empty tree root (hash of nothing)
    // Real root would come from building the merkle tree
    const emptyRoot = Buffer.alloc(32, 0);
    
    // Call set_merkle_root instruction
    const tx = await program.methods
      .setMerkleRoot(Array.from(emptyRoot))
      .accounts({
        censusState: censusPda,
        admin: provider.wallet.publicKey,
      })
      .rpc();

    console.log('✅ Transaction sent:', tx);
    console.log('✨ Merkle root set successfully!');
  } catch (error) {
    console.error('❌ Error setting merkle root:', error);
    throw error;
  }
}

main().catch(console.error);
