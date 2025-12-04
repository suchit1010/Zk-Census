import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { IncrementalMerkleTree } from './merkleTree.js';
import { Storage } from './storage.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID);
const CENSUS_STATE = new PublicKey(process.env.CENSUS_STATE_ADDRESS);
const RPC_URL = process.env.SOLANA_RPC_URL;

let tree = null;
let connection = null;
let lastProcessedSignature = null;

async function loadIDL() {
  const idlPath = path.join(__dirname, '..', 'target', 'idl', 'census.json');
  const idlData = await fs.readFile(idlPath, 'utf-8');
  return JSON.parse(idlData);
}

async function initializeTree() {
  console.log('🌲 Initializing merkle tree...');
  await Storage.initialize();
  
  tree = new IncrementalMerkleTree();
  await tree.initialize();
  
  // Load existing tree data
  const treeData = await Storage.loadTree();
  if (treeData.leaves.length > 0) {
    tree = await IncrementalMerkleTree.fromJSON(treeData);
    console.log(`✅ Loaded ${treeData.leaves.length} leaves from storage`);
  }
  
  console.log(`📊 Current root: ${tree.getRoot()}`);
}

async function processRegistrationEvent(signature, commitment, timestamp) {
  console.log(`\n📝 Processing registration...`);
  console.log(`   Signature: ${signature.slice(0, 20)}...`);
  console.log(`   Commitment: ${commitment}`);
  
  // Check if already processed
  const existing = await Storage.getCitizenByCommitment(commitment);
  if (existing) {
    console.log('   ⚠️  Already indexed, skipping');
    return;
  }
  
  // Insert into tree
  const leafIndex = tree.insert(commitment);
  const newRoot = tree.getRoot();
  
  // Save citizen record
  await Storage.saveCitizen({
    commitment,
    leafIndex,
    signature,
    timestamp: timestamp || Date.now(),
    registered: true
  });
  
  // Save tree
  await Storage.saveTree(tree);
  
  console.log(`   ✅ Indexed as leaf #${leafIndex}`);
  console.log(`   📊 New root: ${newRoot}`);
  console.log(`   🌳 Total leaves: ${tree.leaves.length}`);
}

async function scanHistoricalTransactions() {
  console.log('\n🔍 Scanning historical transactions...');
  
  const signatures = await connection.getSignaturesForAddress(
    PROGRAM_ID,
    { limit: 1000 }
  );
  
  console.log(`Found ${signatures.length} transactions`);
  
  let processedCount = 0;
  
  for (const sigInfo of signatures.reverse()) {
    try {
      const tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx || !tx.meta || tx.meta.err) continue;
      
      // Look for CitizenRegistered event in logs
      const logs = tx.meta.logMessages || [];
      for (const log of logs) {
        if (log.includes('CitizenRegistered')) {
          // Extract commitment from log
          // Format: "Program log: CitizenRegistered { commitment: <value> }"
          const match = log.match(/commitment:\s*(\d+)/);
          if (match) {
            const commitment = match[1];
            await processRegistrationEvent(
              sigInfo.signature,
              commitment,
              sigInfo.blockTime ? sigInfo.blockTime * 1000 : Date.now()
            );
            processedCount++;
          }
        }
      }
    } catch (error) {
      console.error(`Error processing ${sigInfo.signature}:`, error.message);
    }
  }
  
  console.log(`\n✅ Processed ${processedCount} historical registrations`);
  lastProcessedSignature = signatures[0]?.signature;
}

async function listenForNewRegistrations() {
  console.log('\n👂 Listening for new registrations...');
  
  connection.onLogs(
    PROGRAM_ID,
    async (logs) => {
      if (logs.err) return;
      
      for (const log of logs.logs) {
        if (log.includes('CitizenRegistered')) {
          const match = log.match(/commitment:\s*(\d+)/);
          if (match) {
            const commitment = match[1];
            await processRegistrationEvent(logs.signature, commitment);
          }
        }
      }
    },
    'confirmed'
  );
  
  console.log('✅ Websocket listener active');
}

async function getOnChainRoot() {
  try {
    const accountInfo = await connection.getAccountInfo(CENSUS_STATE);
    if (!accountInfo) {
      console.log('⚠️  Census state account not found');
      return null;
    }
    
    // Read merkle root from offset 40-72 (after discriminator + admin)
    const rootBytes = accountInfo.data.slice(40, 72);
    const rootBigInt = rootBytes.reduce((acc, byte, i) => {
      return acc + (BigInt(byte) << BigInt(i * 8));
    }, 0n);
    
    return rootBigInt.toString();
  } catch (error) {
    console.error('Error fetching on-chain root:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Census Merkle Tree Indexer Starting...\n');
  
  connection = new Connection(RPC_URL, 'confirmed');
  
  await initializeTree();
  
  // Check current on-chain root
  const onChainRoot = await getOnChainRoot();
  const localRoot = tree.getRoot();
  
  console.log(`\n📊 Root Comparison:`);
  console.log(`   On-chain: ${onChainRoot}`);
  console.log(`   Local:    ${localRoot}`);
  
  if (onChainRoot !== localRoot && onChainRoot !== '0') {
    console.log('   ⚠️  MISMATCH DETECTED - On-chain root differs from local tree');
    console.log('   💡 You may need to run set-merkle-root.js to update on-chain root');
  } else {
    console.log('   ✅ Roots match!');
  }
  
  // Scan historical transactions
  await scanHistoricalTransactions();
  
  // Start listening for new events
  await listenForNewRegistrations();
  
  console.log('\n✅ Indexer running! Press Ctrl+C to stop.\n');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  await Storage.saveTree(tree);
  console.log('✅ Tree saved');
  process.exit(0);
});

main().catch(console.error);
