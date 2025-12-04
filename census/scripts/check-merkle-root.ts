import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH");

async function main() {
  const provider = anchor.AnchorProvider.env();

  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    PROGRAM_ID
  );

  console.log("📊 Fetching census state from on-chain...\n");
  
  // Manually read account data
  const accountInfo = await provider.connection.getAccountInfo(censusStatePda);
  if (!accountInfo) {
    console.error("❌ Census state account not found!");
    return;
  }

  // Parse account data (skip 8-byte Anchor discriminator)
  const data = accountInfo.data;
  const merkleRoot = data.slice(40, 72); // Merkle root at offset 40
  
  const merkleRootHex = Buffer.from(merkleRoot).toString("hex");
  console.log("✅ Merkle Root: " + merkleRootHex);
  
  // Check if merkle root is all zeros
  const isZeros = merkleRootHex === "0".repeat(64);
  console.log("\n📌 Analysis:");
  console.log("  Is all zeros: " + (isZeros ? "✅ YES" : "❌ NO"));
  
  if (isZeros) {
    console.log("\n💡 The Merkle root is all zeros");
    console.log("   Proof generation should use empty tree (all-zero siblings)");
  }
}

main().catch(console.error);
