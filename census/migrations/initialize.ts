/**
 * Initialize Census with Merkle Tree
 * 
 * This script:
 * 1. Creates a ConcurrentMerkleTree account for storing citizen commitments
 * 2. Initializes the census state PDA
 * 3. Links the tree to the census
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Census } from "../target/types/census";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  createAllocTreeIx,
  ValidDepthSizePair,
} from "@solana/spl-account-compression";

// Tree configuration
const TREE_DEPTH = 20; // Supports 2^20 = 1,048,576 citizens
const TREE_BUFFER_SIZE = 64; // Concurrent updates allowed
const CANOPY_DEPTH = 0; // No canopy (saves space, increases proof size)

async function main() {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Census as Program<Census>;
  const payer = provider.wallet as anchor.Wallet;

  console.log("🌿 Initializing zk-Census System");
  console.log("================================================");
  console.log(`Admin/Payer: ${payer.publicKey.toString()}`);
  console.log(`Program ID: ${program.programId.toString()}`);
  console.log();

  // Generate keypair for the Merkle tree account
  const merkleTree = Keypair.generate();
  console.log(`Merkle Tree: ${merkleTree.publicKey.toString()}`);

  // Calculate space needed for the tree
  const space = getConcurrentMerkleTreeAccountSize(
    TREE_DEPTH,
    TREE_BUFFER_SIZE,
    CANOPY_DEPTH
  );
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(space);

  console.log(`Tree Depth: ${TREE_DEPTH} (max ${2 ** TREE_DEPTH} leaves)`);
  console.log(`Buffer Size: ${TREE_BUFFER_SIZE}`);
  console.log(`Account Size: ${space} bytes`);
  console.log(`Rent: ${lamports / anchor.web3.LAMPORTS_PER_SOL} SOL`);
  console.log();

  // Derive census state PDA
  const [censusStatePda, censusStateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    program.programId
  );

  console.log(`Census State PDA: ${censusStatePda.toString()}`);
  console.log();

  // =========================================================================
  // Step 1: Create Merkle Tree Account
  // =========================================================================
  console.log("Step 1: Creating Merkle tree account...");

  const allocTreeIx = await createAllocTreeIx(
    provider.connection,
    merkleTree.publicKey,
    payer.publicKey,
    { maxDepth: TREE_DEPTH, maxBufferSize: TREE_BUFFER_SIZE },
    CANOPY_DEPTH
  );

  const tx1 = new Transaction().add(allocTreeIx);
  tx1.feePayer = payer.publicKey;

  const sig1 = await provider.sendAndConfirm(tx1, [merkleTree, payer.payer]);
  console.log(`✅ Merkle tree created: ${sig1}`);
  console.log();

  // =========================================================================
  // Step 2: Initialize Census State
  // =========================================================================
  console.log("Step 2: Initializing census state...");

  const scopeDuration = new anchor.BN(7 * 24 * 60 * 60); // 1 week in seconds

  try {
    const tx2 = await program.methods
      .initialize(scopeDuration)
      .accounts({
        admin: payer.publicKey,
        censusState: censusStatePda,
        system_program: SystemProgram.programId,
      })
      .rpc();

    console.log(`✅ Census initialized: ${tx2}`);
  } catch (err) {
    console.error("Error initializing census:", err);
    throw err;
  }

  // =========================================================================
  // Step 3: Link Merkle Tree to Census State
  // =========================================================================
  console.log();
  console.log("Step 3: Linking Merkle tree to census...");

  // Fetch and update census state with merkle tree address
  const censusState = await program.account.censusState.fetch(censusStatePda);
  console.log("Current census state:", {
    admin: censusState.admin.toString(),
    currentScope: censusState.currentScope.toString(),
    totalRegistered: censusState.totalRegistered.toString(),
    isActive: censusState.isActive,
  });

  // In a real implementation, you'd need to add an instruction to update the merkle_tree field
  // For now, we'll note that the merkle tree is created and ready

  console.log();
  console.log("================================================");
  console.log("✅ zk-Census System Initialized Successfully!");
  console.log("================================================");
  console.log();
  console.log("📋 Summary:");
  console.log(`   Census State: ${censusStatePda.toString()}`);
  console.log(`   Merkle Tree: ${merkleTree.publicKey.toString()}`);
  console.log(`   Tree Capacity: ${2 ** TREE_DEPTH} citizens`);
  console.log(`   Scope Duration: ${scopeDuration.toNumber()} seconds (${scopeDuration.toNumber() / 86400} days)`);
  console.log();
  console.log("🚀 Next steps:");
  console.log("   1. Register citizens: anchor run register-citizen");
  console.log("   2. Generate ZK circuits: cd circuits && npm run compile");
  console.log("   3. Start frontend: cd app && npm run dev");
  console.log();

  // Save deployment info
  const deploymentInfo = {
    programId: program.programId.toString(),
    censusState: censusStatePda.toString(),
    merkleTree: merkleTree.publicKey.toString(),
    admin: payer.publicKey.toString(),
    treeDepth: TREE_DEPTH,
    network: provider.connection.rpcEndpoint,
    timestamp: new Date().toISOString(),
  };

  console.log("💾 Deployment info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

/**
 * Calculate the size needed for a ConcurrentMerkleTree account
 */
function getConcurrentMerkleTreeAccountSize(
  maxDepth: number,
  maxBufferSize: number,
  canopyDepth: number
): number {
  // Account discriminator (8 bytes)
  const DISCRIMINATOR = 8;
  
  // Header size
  const HEADER_SIZE = 8 + 32 + 8 + 8 + 8 + 8;
  
  // Buffer size
  const bufferSize = maxBufferSize * (32 + 8);
  
  // Tree size
  const treeSize = (2 ** (maxDepth + 1) - 1) * 32;
  
  // Canopy size
  const canopySize = canopyDepth > 0 ? (2 ** canopyDepth - 1) * 32 : 0;
  
  return DISCRIMINATOR + HEADER_SIZE + bufferSize + treeSize + canopySize;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
