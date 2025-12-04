// ============================================================================
// SEEDS FOR PDA DERIVATION
// ============================================================================

pub const CENSUS_STATE_SEED: &[u8] = b"census_state";

pub const NULLIFIER_SEED: &[u8] = b"nullifier";

pub const MERKLE_TREE_SEED: &[u8] = b"merkle_tree";

// ============================================================================
// MERKLE TREE CONFIGURATION
// ============================================================================

/// Depth of the Merkle tree (2^20 = ~1M citizens)
pub const TREE_DEPTH: usize = 20;

/// Maximum number of concurrent changes (for SPL Account Compression)
pub const MAX_BUFFER_SIZE: usize = 64;

/// Canopy depth for cheaper proofs (stores top N levels on-chain)
pub const CANOPY_DEPTH: usize = 10;
