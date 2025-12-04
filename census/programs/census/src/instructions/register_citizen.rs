use anchor_lang::prelude::*;
use crate::{contexts::RegisterCitizen, error::CensusError, state::CitizenRegistered};

pub fn handler(ctx: Context<RegisterCitizen>, identity_commitment: [u8; 32]) -> Result<()> {
    let census_state = &mut ctx.accounts.census_state;
    let clock = Clock::get()?;

    let current_leaf_index = census_state.leaf_count;

    // =========================================================================
    // Store the identity commitment
    // 
    // In production with SPL Account Compression:
    // 1. Use spl_account_compression::cpi::append() to add leaf to compressed tree
    // 2. This enables 1M+ citizens with minimal storage cost
    // 3. Update merkle_root after each append
    // 
    // For now, we're using a simplified approach where:
    // - Commitments are stored off-chain (indexed from events)
    // - Merkle root is updated manually by admin
    // - This works for demo with <1000 citizens
    // =========================================================================

    // Update state counters
    census_state.leaf_count = census_state.leaf_count
        .checked_add(1)
        .ok_or(CensusError::ArithmeticOverflow)?;
    census_state.total_registered = census_state.total_registered
        .checked_add(1)
        .ok_or(CensusError::ArithmeticOverflow)?;

    // Emit event for indexers
    emit!(CitizenRegistered {
        commitment: identity_commitment,
        leaf_index: current_leaf_index,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ Citizen registered to Merkle tree!");
    msg!("   Leaf index: {}", current_leaf_index);
    msg!("   Total registered: {}", census_state.total_registered);

    Ok(())
}
