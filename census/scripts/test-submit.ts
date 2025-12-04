import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Census } from "../target/types/census";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Census as Program<Census>;
  
  console.log("🧪 Testing Submit Census Transaction...");
  console.log("Program ID:", program.programId.toString());
  console.log("Wallet:", provider.wallet.publicKey.toString());

  // Derive PDAs
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    program.programId
  );

  // Fetch current census state to get the correct scope
  const censusState = await program.account.censusState.fetch(censusStatePda);
  const currentScope = censusState.currentScope.toNumber();
  
  console.log("  Current Scope:", currentScope);

  // Mock proof data (all zeros for testing instruction format)
  const mockProofA = new Array(64).fill(0);
  const mockProofB = new Array(128).fill(0);
  const mockProofC = new Array(64).fill(0);
  
  // Create scope bytes (8 bytes, little-endian)
  const scopeBytes = new Array(32).fill(0);
  scopeBytes[0] = currentScope & 0xFF;
  scopeBytes[1] = (currentScope >> 8) & 0xFF;
  
  const mockPublicInputs = [
    new Array(32).fill(0), // root
    new Array(32).fill(1), // nullifierHash (different to avoid collision)
    new Array(32).fill(0), // signalHash
    scopeBytes,            // externalNullifier (current scope)
  ];

  const nullifierHash = Buffer.from(mockPublicInputs[1]);
  const [nullifierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), nullifierHash],
    program.programId
  );

  console.log("\n📍 PDAs:");
  console.log("  Census State:", censusStatePda.toString());
  console.log("  Nullifier:", nullifierPda.toString());

  try {
    console.log("\n🔧 Building instruction manually...");
    
    // Method 1: Manual instruction (what frontend does)
    const discriminator = Buffer.from([222, 160, 8, 83, 160, 212, 141, 48]);
    const data = Buffer.concat([
      discriminator,
      Buffer.from(mockProofA),
      Buffer.from(mockProofB),
      Buffer.from(mockProofC),
      ...mockPublicInputs.map(p => Buffer.from(p)),
    ]);

    console.log("  Discriminator:", discriminator.toString('hex'));
    console.log("  Data length:", data.length, "bytes");
    console.log("  Expected: 8 (disc) + 64 (A) + 128 (B) + 64 (C) + 4*32 (inputs) =", 8 + 64 + 128 + 64 + 128, "bytes");

    const manualIx = new TransactionInstruction({
      keys: [
        { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: censusStatePda, isSigner: false, isWritable: true },
        { pubkey: nullifierPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: program.programId,
      data,
    });

    console.log("\n📤 Sending manual instruction transaction...");
    const manualTx = await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(manualIx)
    );
    console.log("✅ Manual instruction SUCCESS!");
    console.log("   TX:", manualTx);

  } catch (err: any) {
    console.error("\n❌ Manual instruction FAILED:");
    console.error("   Error:", err.message);
    if (err.logs) {
      console.error("   Program logs:");
      err.logs.forEach((log: string) => console.error("     ", log));
    }
  }

  try {
    console.log("\n🔧 Building instruction with Anchor SDK...");
    
    // Method 2: Anchor SDK (proper way)
    const anchorTx = await program.methods
      .submitCensus(mockProofA, mockProofB, mockProofC, mockPublicInputs)
      .rpc();

    console.log("✅ Anchor SDK SUCCESS!");
    console.log("   TX:", anchorTx);

  } catch (err: any) {
    console.error("\n❌ Anchor SDK FAILED:");
    console.error("   Error:", err.message);
    if (err.logs) {
      console.error("   Program logs:");
      err.logs.forEach((log: string) => console.error("     ", log));
    }
  }
}

main()
  .then(() => {
    console.log("\n✨ Test complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("💥 Fatal error:", err);
    process.exit(1);
  });
