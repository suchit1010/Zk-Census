use anchor_lang::prelude::*;
use crate::contexts::*;

/// Sets the Merkle root for the census state
/// This is called by the admin after building the Merkle tree off-chain
pub fn handler(ctx: Context<SetMerkleRoot>, root: [u8; 32]) -> Result<()> {
    let census_state = &mut ctx.accounts.census_state;
    
    // Set the merkle root
    census_state.merkle_root = root;
    
    msg!("✅ Merkle root set successfully!");
    
    // Anchor will automatically serialize when context exits
    Ok(())
}
