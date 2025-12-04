use anchor_lang::prelude::*;

#[error_code]
pub enum CensusError {
    #[msg("Invalid ZK proof - verification failed")]
    InvalidProof,
    
    #[msg("Nullifier has already been used in this census scope")]
    NullifierAlreadyUsed,
    
    #[msg("Merkle root does not match current census state")]
    InvalidMerkleRoot,
    
    #[msg("Only the admin can register new citizens")]
    UnauthorizedAdmin,
    
    #[msg("Census scope has expired")]
    CensusScopeExpired,
    
    #[msg("Invalid identity commitment format")]
    InvalidCommitment,
    
    #[msg("Merkle tree is full - maximum capacity reached")]
    TreeFull,
    
    #[msg("Invalid proof format - wrong byte length")]
    InvalidProofFormat,
    
    #[msg("Census is not currently active")]
    CensusNotActive,
    
    #[msg("Arithmetic overflow in population counter")]
    ArithmeticOverflow,
    
    #[msg("Invalid signal hash")]
    InvalidSignalHash,
    
    #[msg("Attestation has expired - timestamp too old")]
    AttestationExpired,
    
    #[msg("Invalid verifier signature")]
    InvalidVerifierSignature,
}
