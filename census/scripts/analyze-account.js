const { Connection, PublicKey } = require("@solana/web3.js");

async function main() {
  console.log("🔍 Analyzing account data layout...\n");

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const programId = new PublicKey("9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH");
  
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    programId
  );

  const account = await connection.getAccountInfo(censusStatePda, "confirmed");
  
  console.log(`Account size: ${account.data.length} bytes\n`);
  console.log("📊 Raw hex dump:");
  for (let i = 0; i < account.data.length; i += 16) {
    const slice = account.data.slice(i, Math.min(i + 16, account.data.length));
    const hex = slice.toString('hex').match(/.{1,2}/g).join(' ');
    console.log(`  ${i.toString(16).padStart(4, '0')}: ${hex}`);
  }

  console.log("\n📋 Field parsing:");
  let offset = 0;
  
  // admin (32 bytes)
  const admin = new PublicKey(account.data.slice(offset, offset + 32));
  console.log(`[${offset}-${offset+32}] Admin: ${admin.toBase58()}`);
  offset += 32;

  // merkle_root (32 bytes)
  const merkleRootBytes = account.data.slice(offset, offset + 32);
  console.log(`[${offset}-${offset+32}] Merkle Root: ${merkleRootBytes.toString('hex')}`);
  offset += 32;

  // merkle_tree (32 bytes)
  const merkleTree = new PublicKey(account.data.slice(offset, offset + 32));
  console.log(`[${offset}-${offset+32}] Merkle Tree: ${merkleTree.toBase58()}`);
  offset += 32;

  // current_scope (u64)
  const currentScope = account.data.readBigUInt64LE(offset);
  console.log(`[${offset}-${offset+8}] Current Scope: ${currentScope}`);
  offset += 8;

  // scope_start_time (i64)
  const scopeStartTime = account.data.readBigInt64LE(offset);
  console.log(`[${offset}-${offset+8}] Scope Start Time: ${scopeStartTime}`);
  offset += 8;

  // scope_duration (i64)
  const scopeDuration = account.data.readBigInt64LE(offset);
  console.log(`[${offset}-${offset+8}] Scope Duration: ${scopeDuration}`);
  offset += 8;

  // total_registered (u64)
  const totalRegistered = account.data.readBigUInt64LE(offset);
  console.log(`[${offset}-${offset+8}] Total Registered: ${totalRegistered}`);
  offset += 8;

  // current_population (u64)
  const currentPopulation = account.data.readBigUInt64LE(offset);
  console.log(`[${offset}-${offset+8}] Current Population: ${currentPopulation}`);
  offset += 8;

  // leaf_count (u64)
  const leafCount = account.data.readBigUInt64LE(offset);
  console.log(`[${offset}-${offset+8}] Leaf Count: ${leafCount}`);
  offset += 8;

  // is_active (bool)
  const isActive = account.data[offset] !== 0;
  console.log(`[${offset}] Is Active: ${isActive}`);
  offset += 1;

  // bump (u8)
  const bump = account.data[offset];
  console.log(`[${offset}] Bump: ${bump}`);
  offset += 1;

  console.log(`\n✅ Parsed ${offset} bytes total (out of ${account.data.length} available)`);
}

main().catch(console.error);
