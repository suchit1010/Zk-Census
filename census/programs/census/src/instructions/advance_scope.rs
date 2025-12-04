use anchor_lang::prelude::*;
use crate::{contexts::AdvanceScope, error::CensusError, state::ScopeAdvanced};

pub fn handler(ctx: Context<AdvanceScope>) -> Result<()> {
    let census_state = &mut ctx.accounts.census_state;
    let clock = Clock::get()?;

    let old_scope = census_state.current_scope;
    let final_population = census_state.current_population;

    // Advance to next scope
    census_state.current_scope = census_state.current_scope
        .checked_add(1)
        .ok_or(CensusError::ArithmeticOverflow)?;
    census_state.scope_start_time = clock.unix_timestamp;
    census_state.current_population = 0; // Reset for new scope

    // Emit event for historical tracking
    emit!(ScopeAdvanced {
        old_scope,
        new_scope: census_state.current_scope,
        final_population,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "📅 Census scope advanced: {} → {} (Final population: {})",
        old_scope,
        census_state.current_scope,
        final_population
    );

    Ok(())
}
