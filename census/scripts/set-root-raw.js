const { Connection, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { readFileSync } = require('fs');
const { homedir } = require('os');
const path = require('path');

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const CENSUS_STATE_SEED = 'census_state';

// Load wallet
function loadWallet() {
  const walletPath = process.env.ANCHOR_WALLET || path.join(homedir(), '.config/solana/id.json');
  const secretKey = JSON.parse(readFileSync(walletPath, 'utf-8'));
  return {
    publicKey: PublicKey.default,
    secretKey: Buffer.from(secretKey),
  };
}

// Create keypair from secret key
const { Keypair } = require('@solana/web3.js');
function getKeypair() {
  const walletPath = process.env.ANCHOR_WALLET || path.join(homedir(), '.config/solana/id.json');
  const secretKey = JSON.parse(readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(Buffer.from(secretKey));
}

async function main() {
  console.log('🔍 Setting merkle root (raw instruction)...\n');

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const payer = getKeypair();

  console.log('📋 Account Details:');
  console.log('  Payer:', payer.publicKey.toBase58());
  console.log('  Program ID:', PROGRAM_ID.toBase58());

  // Find census state PDA
  const [censusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(CENSUS_STATE_SEED)],
    PROGRAM_ID
  );

  console.log('  Census State:', censusPda.toBase58());

  try {
    // Build instruction data: discriminator (8 bytes) + root (32 bytes)
    const discriminator = Buffer.from([43, 24, 91, 60, 240, 137, 28, 102]); // set_merkle_root discriminator
    const root = Buffer.alloc(32, 0); // zero root

    const data = Buffer.concat([discriminator, root]);

    console.log('\n⏳ Sending transaction...');

    // Create instruction
    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // admin
        { pubkey: censusPda, isSigner: false, isWritable: true }, // census_state
      ],
      data,
    });

    // Create and send transaction
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer], {
      commitment: 'confirmed',
      maxRetries: 3,
    });

    console.log('\n✅ SUCCESS!');
    console.log('Transaction:', signature);
    console.log('\n✨ Merkle root set on-chain!');
    console.log('🎯 Frontend can now submit proofs.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
