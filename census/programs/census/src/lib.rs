pub mod constants;
pub mod contexts;
pub mod error;
pub mod groth16;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use contexts::*;
pub use error::*;
pub use state::*;

declare_id!("9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH");

/// zk-Census: Privacy-Preserving Population Counter for Network States
/// 
/// A Semaphore-style ZK system for Solana that enables:
/// - Anonymous membership proofs (Merkle inclusion)
/// - Sybil resistance (NFC wristband + admin gatekeeper)
/// - Unique counting (nullifier prevents double-voting)
/// - Real-time population tracking without doxxing
/// 
/// Architecture:
/// - SPL Account Compression for 1M+ citizen Merkle tree
/// - Groth16 verification via alt_bn128 syscalls
/// - Poseidon hashing for identity commitments
#[program]
pub mod census {
    use super::*;

    /// Initialize the zk-Census system
    pub fn initialize(ctx: Context<Initialize>, scope_duration: i64) -> Result<()> {
        instructions::initialize::handler(ctx, scope_duration)
    }

    /// Register a new citizen (admin-only, after NFC verification)
    pub fn register_citizen(
        ctx: Context<RegisterCitizen>,
        identity_commitment: [u8; 32],
    ) -> Result<()> {
        instructions::register_citizen::handler(ctx, identity_commitment)
    }

    /// Submit a census proof (anyone with valid proof)
    pub fn submit_census(
        ctx: Context<SubmitCensus>,
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: [[u8; 32]; 4],
    ) -> Result<()> {
        instructions::submit_census::handler(ctx, proof_a, proof_b, proof_c, public_inputs)
    }

    /// Submit a census attestation (verified off-chain, signature checked on-chain)
    /// This is the RECOMMENDED approach for production!
    pub fn submit_attestation(
        ctx: Context<SubmitAttestation>,
        timestamp: i64,
        merkle_root: [u8; 32],
        nullifier_hash: [u8; 32],
        external_nullifier: [u8; 32],
        signal_hash: [u8; 32],
        signature: [u8; 64],
    ) -> Result<()> {
        instructions::submit_attestation::handler(
            ctx,
            timestamp,
            merkle_root,
            nullifier_hash,
            external_nullifier,
            signal_hash,
            signature,
        )
    }

    /// Advance to the next census scope (admin-only)
    pub fn advance_scope(ctx: Context<AdvanceScope>) -> Result<()> {
        instructions::advance_scope::handler(ctx)
    }

    /// Set the Merkle root (admin-only, called after building tree off-chain)
    pub fn set_merkle_root(ctx: Context<SetMerkleRoot>, root: [u8; 32]) -> Result<()> {
        instructions::set_merkle_root::handler(ctx, root)
    }
}
