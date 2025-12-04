use anchor_lang::prelude::*;
use crate::contexts::Initialize;

pub fn handler(ctx: Context<Initialize>, scope_duration: i64) -> Result<()> {
    let census_state = &mut ctx.accounts.census_state;
    let clock = Clock::get()?;

    // Initialize census state
    census_state.admin = ctx.accounts.admin.key();
    census_state.merkle_tree = Pubkey::default(); // TODO: Link to actual merkle tree
    census_state.merkle_root = [0u8; 32]; // Empty tree root
    census_state.current_scope = 1;
    census_state.scope_start_time = clock.unix_timestamp;
    census_state.scope_duration = scope_duration;
    census_state.total_registered = 0;
    census_state.current_population = 0;
    census_state.leaf_count = 0;
    census_state.is_active = true;
    census_state.bump = ctx.bumps.census_state;

    msg!("✅ zk-Census initialized!");
    msg!("   Admin: {}", census_state.admin);
    msg!("   Scope Duration: {} seconds", scope_duration);

    Ok(())
}
