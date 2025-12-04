/**
 * Reset merkle root to all zeros (matches mock proof for testing)
 * This allows the frontend to submit proofs with the mock merkle tree
 */

const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require('@solana/web3.js');
const fs = require('fs');

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const CENSUS_STATE_SEED = Buffer.from('census_state');

async function main() {
  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load admin keypair
  const adminKeypairPath = process.env.HOME + '/.config/solana/id.json';
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(adminKeypairPath, 'utf-8')))
  );
  
  console.log('Admin:', adminKeypair.publicKey.toBase58());
  
  // Derive census state PDA
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [CENSUS_STATE_SEED],
    PROGRAM_ID
  );
  
  console.log('Census State PDA:', censusStatePda.toBase58());
  
  // Create instruction data
  // Discriminator for set_merkle_root: [43, 24, 91, 60, 240, 137, 28, 102]
  // Root: 32 bytes of zeros
  const discriminator = Buffer.from([43, 24, 91, 60, 240, 137, 28, 102]);
  const root = Buffer.alloc(32); // All zeros
  const data = Buffer.concat([discriminator, root]);
  
  console.log('\nSetting merkle root to all zeros...');
  console.log('Root:', root.toString('hex'));
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: censusStatePda, isSigner: false, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = adminKeypair.publicKey;
  
  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  
  // Sign and send
  transaction.sign(adminKeypair);
  
  const signature = await connection.sendRawTransaction(transaction.serialize());
  console.log('\nTransaction sent:', signature);
  console.log('Explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  
  // Confirm
  await connection.confirmTransaction(signature, 'confirmed');
  console.log('✅ Merkle root reset to zeros!');
  
  // Verify
  const accountInfo = await connection.getAccountInfo(censusStatePda);
  if (accountInfo) {
    // Account layout: [0-8] discriminator, [8-40] admin, [40-72] merkle_root
    const merkleRoot = accountInfo.data.slice(40, 72);
    console.log('\nVerified on-chain merkle root:', merkleRoot.toString('hex'));
    
    const isAllZeros = merkleRoot.every(byte => byte === 0);
    if (isAllZeros) {
      console.log('✅ SUCCESS: Merkle root is now all zeros');
      console.log('✅ Mock proofs will now work in the frontend!');
    } else {
      console.log('❌ WARNING: Merkle root is not all zeros');
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
