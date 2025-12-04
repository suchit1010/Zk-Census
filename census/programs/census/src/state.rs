use anchor_lang::prelude::*;

// ============================================================================
// CENSUS STATE - Main configuration account
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct CensusState {
    /// Admin authority who can register citizens
    pub admin: Pubkey,
    
    /// Current Merkle tree root (updated on each registration)
    pub merkle_root: [u8; 32],
    
    /// Address of the SPL Concurrent Merkle Tree account
    pub merkle_tree: Pubkey,
    
    /// Current census scope (e.g., week number for weekly census)
    pub current_scope: u64,
    
    /// Timestamp when current scope started
    pub scope_start_time: i64,
    
    /// Duration of each census scope in seconds (e.g., 1 week = 604800)
    pub scope_duration: i64,
    
    /// Total number of unique citizens registered (all-time)
    pub total_registered: u64,
    
    /// Population count for current census scope
    pub current_population: u64,
    
    /// Number of leaves in the Merkle tree
    pub leaf_count: u64,
    
    /// Is census currently accepting submissions?
    pub is_active: bool,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
}

// ============================================================================
// NULLIFIER - Tracks used nullifiers to prevent double-counting
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Nullifier {
    /// The nullifier hash (32 bytes from Poseidon)
    pub nullifier_hash: [u8; 32],
    
    /// Census scope this nullifier was used in
    pub scope: u64,
    
    /// Timestamp of submission
    pub timestamp: i64,
    
    /// Bump seed for PDA derivation
    pub bump: u8,
}

// ============================================================================
// CENSUS AGGREGATE - Optional: Anonymous demographic aggregates
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct CensusAggregate {
    /// Census scope this aggregate belongs to
    pub scope: u64,
    
    /// Total unique participants
    pub participant_count: u64,
    
    /// Anonymous attribute counts (e.g., remote workers, builders, etc.)
    /// Signal values 1-10 map to different attributes
    pub attribute_counts: [u64; 10],
    
    /// Timestamp of last update
    pub last_updated: i64,
    
    /// Bump seed
    pub bump: u8,
}

// ============================================================================
// EVENTS - Emitted for off-chain indexing
// ============================================================================

#[event]
pub struct CitizenRegistered {
    pub commitment: [u8; 32],
    pub leaf_index: u64,
    pub timestamp: i64,
}

#[event]
pub struct CensusCounted {
    pub nullifier_hash: [u8; 32],
    pub scope: u64,
    pub new_population: u64,
    pub timestamp: i64,
}

#[event]
pub struct ScopeAdvanced {
    pub old_scope: u64,
    pub new_scope: u64,
    pub final_population: u64,
    pub timestamp: i64,
}
