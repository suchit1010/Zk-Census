import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Census } from "../target/types/census";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Census as Program<Census>;
  
  console.log("📅 Advancing Census Scope...");
  console.log("Program ID:", program.programId.toString());
  console.log("Admin:", provider.wallet.publicKey.toString());

  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    program.programId
  );

  // Check current state
  const stateBefore = await program.account.censusState.fetch(censusStatePda);
  console.log("\n📊 State Before:");
  console.log("  Current Scope:", stateBefore.currentScope.toString());
  console.log("  Current Population:", stateBefore.currentPopulation.toString());
  console.log("  Scope Start Time:", new Date(stateBefore.scopeStartTime.toNumber() * 1000).toISOString());

  const tx = await program.methods
    .advanceScope()
    .rpc();

  console.log("\n✅ Scope Advanced!");
  console.log("Transaction:", tx);

  // Check new state
  const stateAfter = await program.account.censusState.fetch(censusStatePda);
  console.log("\n📊 State After:");
  console.log("  Current Scope:", stateAfter.currentScope.toString());
  console.log("  Current Population:", stateAfter.currentPopulation.toString(), "(reset)");
  console.log("  Scope Start Time:", new Date(stateAfter.scopeStartTime.toNumber() * 1000).toISOString());
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
