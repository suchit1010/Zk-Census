const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey, Keypair, Transaction, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const os = require("os");
const BN = require("bn.js");

async function main() {
  console.log("🔍 Setting merkle root via web3.js with Anchor deserialization...\n");

  // Setup connection
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load wallet
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const admin = walletKeypair.publicKey;

  // Program ID
  const programId = new PublicKey("9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH");

  // Derive census state PDA
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    programId
  );

  console.log("📋 Account Details:");
  console.log(`  Admin: ${admin.toBase58()}`);
  console.log(`  Program ID: ${programId.toBase58()}`);
  console.log(`  Census State: ${censusStatePda.toBase58()}\n`);

  // Merkle root (all zeros for now)
  const merkleRoot = Buffer.alloc(32, 0);

  // Instruction discriminator for set_merkle_root
  const discriminator = Buffer.from([43, 24, 91, 60, 240, 137, 28, 102]);

  // Build instruction data
  const instructionData = Buffer.concat([discriminator, merkleRoot]);

  // Create instruction
  const instruction = new (require("@solana/web3.js")).TransactionInstruction({
    programId,
    keys: [
      {
        pubkey: admin,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: censusStatePda,
        isSigner: false,
        isWritable: true,
      },
    ],
    data: instructionData,
  });

  // Create transaction
  const transaction = new Transaction().add(instruction);

  console.log("⏳ Sending transaction...");

  try {
    const sig = await anchor.web3.sendAndConfirmTransaction(
      connection,
      transaction,
      [walletKeypair],
      { commitment: "confirmed" }
    );

    console.log("\n✅ SUCCESS!");
    console.log(`Transaction: ${sig}\n`);

    // Verify the root was set
    console.log("📊 Verifying account data...");
    await new Promise((r) => setTimeout(r, 1000));

    const account = await connection.getAccountInfo(censusStatePda, "confirmed");
    if (account) {
      const dataHex = account.data.toString("hex");
      console.log(`Account size: ${account.data.length} bytes`);
      console.log(`Data (first 128 chars): ${dataHex.substring(0, 128)}`);

      // Check if merkle root (offset 32-64) was updated
      const rootBytes = account.data.slice(32, 64);
      const isZero = rootBytes.every((b) => b === 0);
      if (isZero) {
        console.log("⚠️  Merkle root is still all zeros (expected for this test)");
      } else {
        console.log("✨ Merkle root updated successfully!");
      }
    }

    console.log("\n🎯 Frontend can now submit proofs.");
  } catch (error) {
    console.error("\n❌ FAILED!");
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
