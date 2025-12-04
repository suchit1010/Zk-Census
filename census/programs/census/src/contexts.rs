use anchor_lang::prelude::*;
use crate::{constants::*, state::*};

/// Initialize the zk-Census system
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Admin authority who will register citizens
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Main census state PDA
    #[account(
        init,
        payer = admin,
        space = 8 + CensusState::INIT_SPACE,
        seeds = [CENSUS_STATE_SEED],
        bump
    )]
    pub census_state: Account<'info, CensusState>,

    pub system_program: Program<'info, System>,
}

/// Register a new citizen (admin-only, after NFC verification)
#[derive(Accounts)]
#[instruction(identity_commitment: [u8; 32])]
pub struct RegisterCitizen<'info> {
    /// Admin authority (gatekeeper)
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Census state - must match admin
    #[account(
        mut,
        seeds = [CENSUS_STATE_SEED],
        bump = census_state.bump,
        constraint = census_state.admin == admin.key() @ crate::error::CensusError::UnauthorizedAdmin,
        constraint = census_state.is_active @ crate::error::CensusError::CensusNotActive
    )]
    pub census_state: Account<'info, CensusState>,

    pub system_program: Program<'info, System>,
}

/// Submit a census proof (anyone with valid proof)
#[derive(Accounts)]
#[instruction(
    proof_a: [u8; 64],
    proof_b: [u8; 128],
    proof_c: [u8; 64],
    public_inputs: [[u8; 32]; 4]
)]
pub struct SubmitCensus<'info> {
    /// Anyone can submit (the proof speaks for itself)
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Census state for verification
    #[account(
        mut,
        seeds = [CENSUS_STATE_SEED],
        bump = census_state.bump,
        constraint = census_state.is_active @ crate::error::CensusError::CensusNotActive
    )]
    pub census_state: Account<'info, CensusState>,

    /// Nullifier PDA - created if proof is valid (prevents double-counting)
    /// Derived from nullifier_hash in public_inputs[1]
    #[account(
        init,
        payer = payer,
        space = 8 + Nullifier::INIT_SPACE,
        seeds = [NULLIFIER_SEED, &public_inputs[1]],
        bump
    )]
    pub nullifier: Account<'info, Nullifier>,

    pub system_program: Program<'info, System>,
}

/// Advance to the next census scope (admin-only)
#[derive(Accounts)]
pub struct AdvanceScope<'info> {
    /// Admin authority
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Census state - must match admin
    #[account(
        mut,
        seeds = [CENSUS_STATE_SEED],
        bump = census_state.bump,
        constraint = census_state.admin == admin.key() @ crate::error::CensusError::UnauthorizedAdmin
    )]
    pub census_state: Account<'info, CensusState>,
}

/// Set the Merkle root (admin-only)
#[derive(Accounts)]
pub struct SetMerkleRoot<'info> {
    /// Admin authority
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Census state - must match admin
    /// Using bump from state since it's already initialized
    #[account(
        mut,
        seeds = [CENSUS_STATE_SEED],
        bump,
        constraint = census_state.admin == admin.key() @ crate::error::CensusError::UnauthorizedAdmin
    )]
    pub census_state: Account<'info, CensusState>,
}

/// Submit a census attestation (off-chain verified, on-chain signature check)
#[derive(Accounts)]
#[instruction(
    timestamp: i64,
    merkle_root: [u8; 32],
    nullifier_hash: [u8; 32],
    external_nullifier: [u8; 32],
    signal_hash: [u8; 32],
    signature: [u8; 64]
)]
pub struct SubmitAttestation<'info> {
    /// Anyone can submit with valid attestation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The trusted verifier that signed the attestation
    /// In production, check this against a list of authorized verifiers
    pub verifier: Signer<'info>,

    /// Census state for verification
    #[account(
        mut,
        seeds = [CENSUS_STATE_SEED],
        bump = census_state.bump,
        constraint = census_state.is_active @ crate::error::CensusError::CensusNotActive
    )]
    pub census_state: Account<'info, CensusState>,

    /// Nullifier PDA - created if attestation is valid (prevents double-counting)
    #[account(
        init,
        payer = payer,
        space = 8 + Nullifier::INIT_SPACE,
        seeds = [NULLIFIER_SEED, &nullifier_hash],
        bump
    )]
    pub nullifier: Account<'info, Nullifier>,

    pub system_program: Program<'info, System>,
}
