import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Census } from "../target/types/census";
import { PublicKey } from "@solana/web3.js";
import * as crypto from "crypto";

// Poseidon hash simulation (for demo - use real poseidon in production)
function generateIdentityCommitment(nfcId: string): Buffer {
  // In production, this would be:
  // commitment = poseidon([identityNullifier, identityTrapdoor])
  // For demo, we use SHA256 as placeholder
  return crypto.createHash('sha256').update(nfcId).digest();
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Census as Program<Census>;
  
  console.log("👥 Registering Test Citizens...");
  console.log("Program ID:", program.programId.toString());
  console.log("Admin:", provider.wallet.publicKey.toString());

  // Derive census_state PDA
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    program.programId
  );

  // Check current state
  const stateBefore = await program.account.censusState.fetch(censusStatePda);
  console.log("\n📊 State Before Registration:");
  console.log("  - Total Registered:", stateBefore.totalRegistered.toString());
  console.log("  - Leaf Count:", stateBefore.leafCount.toString());

  // Test citizens with simulated NFC IDs
  const testCitizens = [
    { nfcId: "NFC-ALICE-001", name: "Alice" },
    { nfcId: "NFC-BOB-002", name: "Bob" },
    { nfcId: "NFC-CHARLIE-003", name: "Charlie" },
  ];

  console.log("\n🔐 Generating Identity Commitments...");
  
  for (const citizen of testCitizens) {
    const commitment = generateIdentityCommitment(citizen.nfcId);
    
    console.log(`\n📝 Registering ${citizen.name} (${citizen.nfcId})`);
    console.log("   Commitment:", commitment.toString('hex').slice(0, 32) + "...");

    try {
      const tx = await program.methods
        .registerCitizen(Array.from(commitment))
        .rpc();

      console.log("   ✅ Registered!");
      console.log("   Transaction:", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    } catch (err: any) {
      console.log("   ❌ Failed:", err.message);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Check final state
  const stateAfter = await program.account.censusState.fetch(censusStatePda);
  console.log("\n📊 State After Registration:");
  console.log("  - Total Registered:", stateAfter.totalRegistered.toString());
  console.log("  - Leaf Count:", stateAfter.leafCount.toString());
  console.log("  - Merkle Root:", Buffer.from(stateAfter.merkleRoot).toString('hex').slice(0, 32) + "...");

  console.log("\n✅ Citizens registered successfully!");
  console.log("\n💡 Next Steps:");
  console.log("   1. Use these NFC IDs in the frontend to generate proofs");
  console.log("   2. Submit proofs to count each citizen");
  console.log("   3. Verify nullifier prevents double-counting");
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
