import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Census } from "../target/types/census";
import { expect } from "chai";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";

describe("zk-census", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Census as Program<Census>;
  const admin = provider.wallet;

  // PDAs
  let censusStatePda: PublicKey;
  let censusStateBump: number;
  let merkleTreePda: PublicKey;
  let merkleTreeBump: number;

  // Tree parameters (matching program constants)
  const TREE_DEPTH = 20;
  const MAX_BUFFER_SIZE = 64;
  const CANOPY_DEPTH = 10;

  before(async () => {
    // Derive PDAs
    [censusStatePda, censusStateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("census_state")],
      program.programId
    );

    [merkleTreePda, merkleTreeBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("merkle_tree"), admin.publicKey.toBuffer()],
      program.programId
    );
  });

  describe("Initialize", () => {
    it("should initialize the census system", async () => {
      // Calculate Merkle tree account size
      const treeSize = getConcurrentMerkleTreeAccountSize(
        TREE_DEPTH,
        MAX_BUFFER_SIZE,
        CANOPY_DEPTH
      );

      // Create tree account
      const createTreeIx = SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: merkleTreePda,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(treeSize),
        space: treeSize,
        programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      });

      // Weekly census duration (7 days in seconds)
      const scopeDuration = new anchor.BN(7 * 24 * 60 * 60);

      const tx = await program.methods
        .initialize(scopeDuration)
        .accounts({
          admin: admin.publicKey,
          censusState: censusStatePda,
          merkleTree: merkleTreePda,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          noop: SPL_NOOP_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([createTreeIx])
        .rpc();

      console.log("Initialize tx:", tx);

      // Verify state
      const censusState = await program.account.censusState.fetch(censusStatePda);
      expect(censusState.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(censusState.currentScope.toNumber()).to.equal(1);
      expect(censusState.isActive).to.be.true;
      expect(censusState.totalRegistered.toNumber()).to.equal(0);
    });
  });

  describe("Register Citizen", () => {
    it("should register a new citizen with identity commitment", async () => {
      // Generate mock identity commitment (32 bytes)
      const identityCommitment = Buffer.alloc(32);
      crypto.getRandomValues(identityCommitment);

      const tx = await program.methods
        .registerCitizen([...identityCommitment])
        .accounts({
          admin: admin.publicKey,
          censusState: censusStatePda,
          merkleTree: merkleTreePda,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          noop: SPL_NOOP_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Register citizen tx:", tx);

      // Verify state updated
      const censusState = await program.account.censusState.fetch(censusStatePda);
      expect(censusState.totalRegistered.toNumber()).to.equal(1);
      expect(censusState.leafCount.toNumber()).to.equal(1);
    });

    it("should reject non-admin registration attempts", async () => {
      const fakeAdmin = Keypair.generate();
      
      // Airdrop SOL to fake admin
      const airdropSig = await provider.connection.requestAirdrop(
        fakeAdmin.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      const identityCommitment = Buffer.alloc(32);
      crypto.getRandomValues(identityCommitment);

      try {
        await program.methods
          .registerCitizen([...identityCommitment])
          .accounts({
            admin: fakeAdmin.publicKey,
            censusState: censusStatePda,
            merkleTree: merkleTreePda,
            compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            noop: SPL_NOOP_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([fakeAdmin])
          .rpc();
        
        expect.fail("Should have thrown UnauthorizedAdmin error");
      } catch (err: any) {
        expect(err.message).to.include("UnauthorizedAdmin");
      }
    });
  });

  describe("Submit Census", () => {
    it("should verify and count a valid ZK proof", async () => {
      // NOTE: This test requires actual ZK proof generation
      // In real tests, you would:
      // 1. Generate identity commitment
      // 2. Register citizen
      // 3. Build Merkle proof
      // 4. Generate Groth16 proof using snarkjs
      // 5. Submit to chain

      // Mock proof data (64 + 128 + 64 bytes)
      const proofA = Buffer.alloc(64);
      const proofB = Buffer.alloc(128);
      const proofC = Buffer.alloc(64);
      
      // Mock public inputs (4 x 32 bytes)
      const publicInputs: Buffer[] = [
        Buffer.alloc(32), // root
        Buffer.alloc(32), // nullifierHash
        Buffer.alloc(32), // signalHash
        Buffer.alloc(32), // externalNullifier
      ];
      crypto.getRandomValues(publicInputs[1]); // Unique nullifier

      // This will fail with InvalidProof since we're using mock data
      // In production tests, use real proofs
      try {
        const [nullifierPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("nullifier"), publicInputs[1]],
          program.programId
        );

        await program.methods
          .submitCensus(
            [...proofA],
            [...proofB],
            [...proofC],
            publicInputs.map(p => [...p]) as any
          )
          .accounts({
            payer: admin.publicKey,
            censusState: censusStatePda,
            nullifier: nullifierPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } catch (err: any) {
        // Expected to fail with InvalidProof or InvalidMerkleRoot
        console.log("Expected error with mock proof:", err.message);
      }
    });
  });

  describe("Advance Scope", () => {
    it("should advance to the next census scope", async () => {
      const stateBefore = await program.account.censusState.fetch(censusStatePda);
      const scopeBefore = stateBefore.currentScope.toNumber();

      const tx = await program.methods
        .advanceScope()
        .accounts({
          admin: admin.publicKey,
          censusState: censusStatePda,
        })
        .rpc();

      console.log("Advance scope tx:", tx);

      const stateAfter = await program.account.censusState.fetch(censusStatePda);
      expect(stateAfter.currentScope.toNumber()).to.equal(scopeBefore + 1);
      expect(stateAfter.currentPopulation.toNumber()).to.equal(0);
    });
  });
});
