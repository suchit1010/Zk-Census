import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, Program, web3 } from '@coral-xyz/anchor';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID);
const CENSUS_STATE = new PublicKey(process.env.CENSUS_STATE_ADDRESS);
const RPC_URL = process.env.SOLANA_RPC_URL;

async function main() {
  console.log('🔄 Syncing on-chain merkle root from indexer...\n');

  // Load tree data
  const treeDataPath = path.join(__dirname, 'data', 'tree.json');
  const treeData = JSON.parse(await fs.readFile(treeDataPath, 'utf-8'));

  if (treeData.leaves.length === 0) {
    console.log('⚠️  No leaves in tree, cannot compute root');
    process.exit(1);
  }

  // Get root from API (more reliable than recomputing)
  const apiUrl = 'http://localhost:3001/api/merkle-root';
  console.log(`📡 Fetching root from API: ${apiUrl}`);
  
  const response = await fetch(apiUrl);
  if (!response.ok) {
    console.log('⚠️  API not available, make sure to start the API server first');
    console.log('   Run: cd api && npm start');
    process.exit(1);
  }
  
  const { root, leafCount } = await response.json();
  console.log(`✅ Root from API: ${root}`);
  console.log(`📊 Leaf count: ${leafCount}\n`);

  // Load admin keypair
  const keypairPath = path.join(__dirname, '..', 'target', 'deploy', 'census-keypair.json');
  const keypairData = JSON.parse(await fs.readFile(keypairPath, 'utf-8'));
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log(`🔑 Admin pubkey: ${adminKeypair.publicKey.toString()}\n`);

  // Connect to Solana
  const connection = new Connection(RPC_URL, 'confirmed');

  // Load IDL
  const idlPath = path.join(__dirname, '..', 'target', 'idl', 'census.json');
  const idl = JSON.parse(await fs.readFile(idlPath, 'utf-8'));

  // Create provider and program
  const provider = new AnchorProvider(
    connection,
    { publicKey: adminKeypair.publicKey },
    { commitment: 'confirmed' }
  );
  const program = new Program(idl, PROGRAM_ID, provider);

  // Convert root string to bytes (little-endian)
  const rootBigInt = BigInt(root);
  const rootBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    rootBytes[i] = Number((rootBigInt >> BigInt(i * 8)) & BigInt(0xff));
  }

  console.log('📤 Sending set_merkle_root transaction...');

  try {
    const tx = await program.methods
      .setMerkleRoot(Array.from(rootBytes))
      .accounts({
        admin: adminKeypair.publicKey,
        censusState: CENSUS_STATE,
      })
      .signers([adminKeypair])
      .rpc();

    console.log(`✅ Transaction successful: ${tx}\n`);

    // Wait for confirmation
    await connection.confirmTransaction(tx, 'confirmed');

    // Verify
    console.log('🔍 Verifying on-chain root...');
    const accountInfo = await connection.getAccountInfo(CENSUS_STATE);
    const onChainRootBytes = accountInfo.data.slice(40, 72);
    const onChainRoot = onChainRootBytes.reduce((acc, byte, i) => {
      return acc + (BigInt(byte) << BigInt(i * 8));
    }, 0n).toString();

    console.log(`   Expected: ${root}`);
    console.log(`   On-chain: ${onChainRoot}`);

    if (onChainRoot === root) {
      console.log('\n✅ SUCCESS: Merkle root synced!');
    } else {
      console.log('\n❌ MISMATCH: Root not synced correctly');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
