pragma circom 2.1.9;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/mux1.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";

/*
 * zk-Census Circuit: Semaphore-style Privacy-Preserving Population Counter
 * 
 * This circuit enables citizens to prove:
 * 1. They are a member of the census (Merkle inclusion)
 * 2. They haven't voted twice in this census scope (nullifier uniqueness)
 * 3. They're signaling a value (signal = 1 for "I'm alive")
 * 
 * All without revealing their identity!
 */

// Merkle Tree inclusion proof for a specific depth
template MerkleTreeInclusionProof(DEPTH) {
    signal input leaf;
    signal input pathIndices[DEPTH];    // 0 = left, 1 = right
    signal input siblings[DEPTH];
    
    signal output root;
    
    signal hashes[DEPTH + 1];
    hashes[0] <== leaf;
    
    component hashers[DEPTH];
    component mux[DEPTH][2];
    
    for (var i = 0; i < DEPTH; i++) {
        // Verify pathIndices is binary
        pathIndices[i] * (1 - pathIndices[i]) === 0;
        
        // Select left and right inputs based on path
        mux[i][0] = Mux1();
        mux[i][0].c[0] <== hashes[i];
        mux[i][0].c[1] <== siblings[i];
        mux[i][0].s <== pathIndices[i];
        
        mux[i][1] = Mux1();
        mux[i][1].c[0] <== siblings[i];
        mux[i][1].c[1] <== hashes[i];
        mux[i][1].s <== pathIndices[i];
        
        // Hash the pair
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i][0].out;
        hashers[i].inputs[1] <== mux[i][1].out;
        
        hashes[i + 1] <== hashers[i].out;
    }
    
    root <== hashes[DEPTH];
}

// Generate identity commitment from secret components
template IdentityCommitment() {
    signal input identityNullifier;
    signal input identityTrapdoor;
    
    signal output commitment;
    
    component hasher = Poseidon(2);
    hasher.inputs[0] <== identityNullifier;
    hasher.inputs[1] <== identityTrapdoor;
    
    commitment <== hasher.out;
}

// Generate nullifier hash (prevents double-voting)
template NullifierHash() {
    signal input identityNullifier;
    signal input externalNullifier;  // censusScope (e.g., "week_2024_01")
    
    signal output nullifierHash;
    
    component hasher = Poseidon(2);
    hasher.inputs[0] <== externalNullifier;
    hasher.inputs[1] <== identityNullifier;
    
    nullifierHash <== hasher.out;
}

// Main Census Circuit
// TREE_DEPTH: Depth of Merkle tree (20 = ~1M citizens, 26 = ~67M)
template Census(TREE_DEPTH) {
    // Private inputs (known only to the prover)
    signal input identityNullifier;
    signal input identityTrapdoor;
    signal input treePathIndices[TREE_DEPTH];
    signal input treeSiblings[TREE_DEPTH];
    
    // Public inputs (visible on-chain)
    signal input signalHash;          // Hash of the signal being broadcast (e.g., "1" for alive)
    signal input externalNullifier;   // Census scope identifier (prevents cross-census linking)
    
    // Public outputs
    signal output root;
    signal output nullifierHash;
    
    // 1. Compute identity commitment from secrets
    component identityCommitment = IdentityCommitment();
    identityCommitment.identityNullifier <== identityNullifier;
    identityCommitment.identityTrapdoor <== identityTrapdoor;
    
    // 2. Verify Merkle tree inclusion (proves membership)
    component merkleProof = MerkleTreeInclusionProof(TREE_DEPTH);
    merkleProof.leaf <== identityCommitment.commitment;
    for (var i = 0; i < TREE_DEPTH; i++) {
        merkleProof.pathIndices[i] <== treePathIndices[i];
        merkleProof.siblings[i] <== treeSiblings[i];
    }
    root <== merkleProof.root;
    
    // 3. Compute nullifier hash (prevents double-counting)
    component nullifier = NullifierHash();
    nullifier.identityNullifier <== identityNullifier;
    nullifier.externalNullifier <== externalNullifier;
    nullifierHash <== nullifier.nullifierHash;
    
    // 4. Square signal hash to prevent tampering (standard Semaphore pattern)
    signal signalHashSquared;
    signalHashSquared <== signalHash * signalHash;
}

// Main component with tree depth of 20 (~1M citizens)
// For larger populations, increase to 26 (~67M) or 30 (~1B)
component main {public [signalHash, externalNullifier]} = Census(20);
