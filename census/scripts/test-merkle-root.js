const { Connection, PublicKey, Keypair, Transaction } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

async function main() {
  console.log("🧪 TEST: Setting merkle root with actual data\n");

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load wallet
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const admin = walletKeypair.publicKey;
  const programId = new PublicKey("9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH");

  // Derive census state PDA
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    programId
  );

  // Create a test merkle root with actual data (not all zeros)
  const testRoot = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    testRoot[i] = (i + 1) * 7; // Pattern: 7, 14, 21, 28, ...
  }

  console.log("📊 Test Data:");
  console.log(`  Test Root (hex): ${testRoot.toString("hex")}`);
  console.log(`  Expected at offset 32-64\n`);

  // Get account BEFORE
  console.log("📋 BEFORE transaction:");
  const accountBefore = await connection.getAccountInfo(censusStatePda, "confirmed");
  if (accountBefore) {
    const rootBefore = accountBefore.data.slice(32, 64);
    console.log(`  Merkle root (hex): ${rootBefore.toString("hex")}`);
    console.log(`  Is zero: ${rootBefore.every((b) => b === 0)}\n`);
  }

  // Instruction discriminator for set_merkle_root
  const discriminator = Buffer.from([43, 24, 91, 60, 240, 137, 28, 102]);

  // Build instruction data: discriminator + root
  const instructionData = Buffer.concat([discriminator, testRoot]);

  console.log(`📝 Instruction Data (hex): ${instructionData.toString("hex")}\n`);

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

  // Create and send transaction
  const transaction = new Transaction().add(instruction);

  console.log("⏳ Sending transaction...");
  const sig = await (require("@coral-xyz/anchor")).web3.sendAndConfirmTransaction(
    connection,
    transaction,
    [walletKeypair],
    { commitment: "confirmed" }
  );

  console.log(`✅ Transaction sent: ${sig}\n`);

  // Wait a moment for finalization
  await new Promise((r) => setTimeout(r, 2000));

  // Get account AFTER
  console.log("📋 AFTER transaction:");
  const accountAfter = await connection.getAccountInfo(censusStatePda, "confirmed");
  if (accountAfter) {
    const rootAfter = accountAfter.data.slice(32, 64);
    console.log(`  Merkle root (hex): ${rootAfter.toString("hex")}`);
    console.log(`  Is zero: ${rootAfter.every((b) => b === 0)}`);
    console.log(`  Matches test data: ${rootAfter.equals(testRoot)}\n`);

    if (rootAfter.equals(testRoot)) {
      console.log("✅ SUCCESS! Merkle root persisted correctly!");
    } else {
      console.log("❌ FAILURE! Merkle root did not persist");
      console.log(`  Expected: ${testRoot.toString("hex")}`);
      console.log(`  Got:      ${rootAfter.toString("hex")}`);
    }
  }

  // Check program logs
  console.log("\n📜 Program logs:");
  const tx = await connection.getTransaction(sig, { commitment: "confirmed" });
  if (tx?.meta?.logMessages) {
    tx.meta.logMessages.forEach((log) => {
      if (log.includes("Program log") || log.includes("Merkle")) {
        console.log(`  ${log}`);
      }
    });
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
