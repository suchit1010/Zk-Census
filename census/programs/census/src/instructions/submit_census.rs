use anchor_lang::prelude::*;
use crate::{contexts::SubmitCensus, error::CensusError, state::CensusCounted, groth16};

pub fn handler(
    ctx: Context<SubmitCensus>,
    proof_a: [u8; 64],
    proof_b: [u8; 128],
    proof_c: [u8; 64],
    public_inputs: [[u8; 32]; 4], // [root, nullifierHash, signalHash, externalNullifier]
) -> Result<()> {
    let census_state = &mut ctx.accounts.census_state;
    let nullifier = &mut ctx.accounts.nullifier;
    let clock = Clock::get()?;

    // Extract public inputs
    let proof_root = &public_inputs[0];
    let nullifier_hash = public_inputs[1];
    let _signal_hash = &public_inputs[2];
    let external_nullifier = &public_inputs[3];

    // Verify the Merkle root matches current state
    require!(
        proof_root == &census_state.merkle_root,
        CensusError::InvalidMerkleRoot
    );

    // Verify external nullifier matches current scope
    let scope_bytes = census_state.current_scope.to_le_bytes();
    let mut expected_external = [0u8; 32];
    expected_external[..8].copy_from_slice(&scope_bytes);
    require!(
        external_nullifier == &expected_external,
        CensusError::CensusScopeExpired
    );

    // =========================================================================
    // GROTH16 ZK PROOF VERIFICATION using alt_bn128 syscalls
    // =========================================================================
    
    // Get verification key for the census circuit
    let vkey = groth16::get_verification_key();
    
    // Verify the proof
    let proof_valid = groth16::verify_groth16_proof(
        &proof_a,
        &proof_b,
        &proof_c,
        &public_inputs,
        &vkey,
    )?;
    
    require!(proof_valid, CensusError::InvalidProof);

    msg!("✓ Groth16 proof verified successfully using alt_bn128");

    // =========================================================================
    // Record the nullifier and increment population
    // =========================================================================

    // Mark nullifier as used
    nullifier.nullifier_hash = nullifier_hash;
    nullifier.scope = census_state.current_scope;
    nullifier.timestamp = clock.unix_timestamp;
    nullifier.bump = ctx.bumps.nullifier;

    // Increment population counter
    census_state.current_population = census_state.current_population
        .checked_add(1)
        .ok_or(CensusError::ArithmeticOverflow)?;

    // Emit event for real-time dashboards
    emit!(CensusCounted {
        nullifier_hash,
        scope: census_state.current_scope,
        new_population: census_state.current_population,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "✅ Census proof recorded! Population now: {} (Scope: {})",
        census_state.current_population,
        census_state.current_scope
    );

    Ok(())
}
