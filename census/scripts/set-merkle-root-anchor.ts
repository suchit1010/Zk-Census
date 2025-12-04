import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Census } from "../target/types/census";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// Load IDL manually
const idlPath = path.join(__dirname, "../target/idl/census.json");
const idlData = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

async function main() {
  console.log("🔍 Setting merkle root via Anchor Program API...\n");

  // Setup provider
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  // Create program instance with loaded IDL
  const programId = new PublicKey("9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH");
  const program = new Program(
    idlData,
    programId,
    provider
  );

  // Get admin (payer)
  const admin = (provider.wallet as any).publicKey;

  // Derive census state PDA
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    program.programId
  );

  console.log("📋 Account Details:");
  console.log(`  Admin: ${admin.toBase58()}`);
  console.log(`  Program ID: ${program.programId.toBase58()}`);
  console.log(`  Census State: ${censusStatePda.toBase58()}\n`);

  // Create merkle root (all zeros for now, matching the raw instruction)
  const merkleRoot = Buffer.alloc(32, 0);

  console.log("⏳ Calling set_merkle_root instruction...");

  try {
    const tx = await (program.methods as any)
      .setMerkleRoot([...merkleRoot])
      .accounts({
        admin,
        census_state: censusStatePda,
      })
      .rpc();

    console.log("\n✅ SUCCESS!");
    console.log(`Transaction: ${tx}\n`);
    console.log("✨ Merkle root set on-chain!");
    console.log("🎯 Frontend can now submit proofs.");
  } catch (error: any) {
    console.error("\n❌ FAILED!");
    console.error("Error:", error.message);
    if (error.logs) {
      console.error("\nProgram logs:");
      error.logs.forEach((log: string) => console.error(`  ${log}`));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
