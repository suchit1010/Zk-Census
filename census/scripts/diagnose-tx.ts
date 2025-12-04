import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Load the IDL
const idl = JSON.parse(fs.readFileSync("./target/idl/census.json", "utf-8"));

const PROGRAM_ID = new PublicKey("9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, PROGRAM_ID, provider) as any;

  console.log("🔍 Diagnosing transaction simulation...\n");

  // Fetch census state
  const [censusStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("census_state")],
    PROGRAM_ID
  );

  console.log("📊 Fetching census state...");
  const censusState = await program.account.censusState.fetch(censusStatePda);

  console.log("Census State:", {
    admin: censusState.admin.toBase58(),
    merkleRoot: Buffer.from(censusState.merkleRoot).toString("hex").slice(0, 32) + "...",
    currentScope: censusState.currentScope.toNumber(),
    scopeDuration: censusState.scopeDuration.toNumber(),
    scopeStartTime: new Date(censusState.scopeStartTime.toNumber() * 1000),
    currentPopulation: censusState.currentPopulation.toNumber(),
    totalRegistered: censusState.totalRegistered.toNumber(),
  });

  // Create a test proof with the correct structure
  const mockProofA = new Array(64).fill(0);
  const mockProofB = new Array(128).fill(0);
  const mockProofC = new Array(64).fill(0);
  const mockPublicInputs = [
    Buffer.from(censusState.merkleRoot), // root
    Buffer.alloc(32), // nullifierHash (zeros)
    Buffer.alloc(32, 1), // signalHash (1)
    Buffer.alloc(32, censusState.currentScope.toNumber()), // externalNullifier
  ];

  // Build the instruction
  const discriminator = Buffer.from([222, 160, 8, 83, 160, 212, 141, 48]);
  const instructionData = Buffer.concat([
    discriminator,
    Buffer.from(mockProofA),
    Buffer.from(mockProofB),
    Buffer.from(mockProofC),
    ...mockPublicInputs,
  ]);

  console.log("\n📋 Instruction Data:");
  console.log(`  Total size: ${instructionData.length} bytes`);
  console.log(`  Discriminator: ${discriminator.toString("hex")}`);

  // Derive PDAs
  const userPubkey = provider.wallet.publicKey;
  const nullifierHash = mockPublicInputs[1];
  const [nullifierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), nullifierHash],
    PROGRAM_ID
  );

  console.log("\n👤 Account Info:");
  console.log(`  User: ${userPubkey.toBase58()}`);
  console.log(`  Census State: ${censusStatePda.toBase58()}`);
  console.log(`  Nullifier PDA: ${nullifierPda.toBase58()}`);

  // Create the instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: userPubkey, isSigner: true, isWritable: true },
      { pubkey: censusStatePda, isSigner: false, isWritable: true },
      { pubkey: nullifierPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });

  // Get latest blockhash
  const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash("confirmed");

  // Create and sign transaction
  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: userPubkey,
  }).add(instruction);

  // Sign the transaction
  tx.sign(provider.wallet as any);

  console.log("\n📤 Simulating transaction...");

  try {
    const simulation = await provider.connection.simulateTransaction(tx, []);

    if (simulation.value.err) {
      console.error("\n❌ Simulation failed with error:");
      console.error(JSON.stringify(simulation.value.err, null, 2));

      if (simulation.value.logs) {
        console.log("\n📋 Program Logs:");
        simulation.value.logs.forEach((log: string) => {
          console.log("  ", log);
        });
      }
    } else {
      console.log("\n✅ Simulation succeeded!");
      if (simulation.value.logs) {
        console.log("\n📋 Program Logs:");
        simulation.value.logs.forEach((log: string) => {
          console.log("  ", log);
        });
      }
    }
  } catch (error) {
    console.error("Error during simulation:", error);
  }
}

main().catch(console.error);
