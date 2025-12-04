const { Connection, PublicKey } = require("@solana/web3.js");
const BN = require("bn.js");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const censusStateAddress = new PublicKey("27xNCnHd7NBPTSgkKVNWjfc7gauTqtQpEWKbfxvUEDDr");

  console.log("🔍 Analyzing account data layout (CORRECTED)...\n");

  const account = await connection.getAccountInfo(censusStateAddress, "confirmed");

  if (!account) {
    console.log("Account not found");
    return;
  }

  const data = account.data;
  console.log(`Account size: ${data.length} bytes\n`);

  console.log("📊 Raw hex dump:");
  for (let i = 0; i < data.length; i += 16) {
    let line = `  ${i.toString(16).padStart(4, "0")}: `;
    let ascii = "";

    for (let j = 0; j < 16 && i + j < data.length; j++) {
      const byte = data[i + j];
      line += byte.toString(16).padStart(2, "0") + " ";
      ascii += byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".";
    }

    console.log(line + "   " + ascii);
  }

  console.log("\n📋 Field parsing (CORRECT OFFSETS):");

  // Parse admin (0-32)
  const adminPubkey = new PublicKey(data.slice(0, 32));
  console.log(`[0-32] Admin: ${adminPubkey.toBase58()}`);

  // Parse merkle_root (32-64) - FULL 32 bytes
  const merkleRootBytes = data.slice(32, 64);
  const merkleRootHex = merkleRootBytes.toString("hex");
  console.log(
    `[32-64] Merkle Root (full 32 bytes): ${merkleRootHex}`
  );

  // Check if it's all zeros
  const isZero = merkleRootBytes.every((b) => b === 0);
  console.log(`        Is zero: ${isZero}`);

  // Parse merkle_tree (64-96)
  const merkleTreePubkey = new PublicKey(data.slice(64, 96));
  console.log(`[64-96] Merkle Tree: ${merkleTreePubkey.toBase58()}`);

  // Parse current_scope (96-104) - u64
  const currentScope = new BN(data.slice(96, 104), "le");
  console.log(`[96-104] Current Scope: ${currentScope.toString()}`);

  // Parse scope_start_time (104-112) - i64
  const scopeStartTime = new BN(data.slice(104, 112), "le");
  console.log(`[104-112] Scope Start Time: ${scopeStartTime.toString()}`);

  // Parse scope_duration (112-120) - i64
  const scopeDuration = new BN(data.slice(112, 120), "le");
  console.log(`[112-120] Scope Duration: ${scopeDuration.toString()}`);

  // Parse total_registered (120-128) - u64
  const totalRegistered = new BN(data.slice(120, 128), "le");
  console.log(`[120-128] Total Registered: ${totalRegistered.toString()}`);

  // Parse current_population (128-136) - u64
  const currentPopulation = new BN(data.slice(128, 136), "le");
  console.log(`[128-136] Current Population: ${currentPopulation.toString()}`);

  // Parse leaf_count (136-144) - u64
  const leafCount = new BN(data.slice(136, 144), "le");
  console.log(`[136-144] Leaf Count: ${leafCount.toString()}`);

  // Parse is_active (144) - bool
  const isActive = data[144] !== 0;
  console.log(`[144] Is Active: ${isActive}`);

  // Parse bump (145) - u8
  const bump = data[145];
  console.log(`[145] Bump: ${bump}`);

  console.log(`\n✅ Parsed 146 bytes total (out of ${data.length} available)`);
}

main().catch(console.error);
