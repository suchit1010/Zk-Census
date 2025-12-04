import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Census } from "../target/types/census";
import { PublicKey } from "@solana/web3.js";

async function main() {
  // Configure the client to use devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Census as Program<Census>;
  
  console.log("🚀 Initializing Census State...");
  console.log("Program ID:", program.programId.toString());
  console.log("Admin (your wallet):", provider.wallet.publicKey.toString());

  // Derive census_state PDA
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    program.programId
  );

  console.log("\n📍 Census State PDA:", censusStatePda.toString());

  try {
    // Check if already initialized
    const existingState = await program.account.censusState.fetchNullable(censusStatePda);
    
    if (existingState) {
      console.log("\n⚠️  Census state already initialized!");
      console.log("Current state:");
      console.log("  - Admin:", existingState.admin.toString());
      console.log("  - Merkle Root:", Buffer.from(existingState.merkleRoot).toString('hex').slice(0, 16) + "...");
      console.log("  - Leaf Count:", existingState.leafCount.toString());
      console.log("  - Total Registered:", existingState.totalRegistered.toString());
      console.log("  - Current Population:", existingState.currentPopulation.toString());
      console.log("  - Current Scope:", existingState.currentScope.toString());
      console.log("  - Scope Duration:", existingState.scopeDuration.toString(), "seconds");
      console.log("  - Scope Start Time:", new Date(existingState.scopeStartTime.toNumber() * 1000).toISOString());
      return;
    }
  } catch (err) {
    // Account doesn't exist yet, continue with initialization
    console.log("✅ Census state not initialized yet, proceeding...");
  }

  // Initialize with 1 week scope duration (604800 seconds)
  const scopeDuration = new anchor.BN(604800);

  const tx = await program.methods
    .initialize(scopeDuration)
    .rpc();

  console.log("\n✅ Census State Initialized!");
  console.log("Transaction signature:", tx);
  console.log("Explorer:", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);

  // Fetch and display the initialized state
  const state = await program.account.censusState.fetch(censusStatePda);
  
  console.log("\n📊 Initial State:");
  console.log("  - Admin:", state.admin.toString());
  console.log("  - Merkle Root:", Buffer.from(state.merkleRoot).toString('hex').slice(0, 32) + "...");
  console.log("  - Leaf Count:", state.leafCount.toString());
  console.log("  - Total Registered:", state.totalRegistered.toString());
  console.log("  - Current Population:", state.currentPopulation.toString());
  console.log("  - Current Scope:", state.currentScope.toString());
  console.log("  - Scope Duration:", state.scopeDuration.toString(), "seconds (1 week)");
  console.log("  - Scope Start Time:", new Date(state.scopeStartTime.toNumber() * 1000).toISOString());
}

main()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
