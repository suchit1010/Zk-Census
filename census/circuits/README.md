# zk-Census Circuits

## Setup Instructions

### 1. Install Dependencies
```bash
cd circuits
npm install
```

### 2. Download Powers of Tau (Trusted Setup)
For tree depth 20, we need at least 2^21 constraints:
```bash
# Download from Hermez trusted setup ceremony
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_21.ptau -O pot20_final.ptau
```

### 3. Compile Circuit
```bash
npm run compile
```

### 4. Generate Proving/Verification Keys
```bash
npm run setup
npm run contribute
npm run export-vkey
```

### 5. Generate Rust Verifier
The verification key will be used in the Anchor program. Copy `build/verification_key.json` to the program directory.

## Circuit Parameters

- **Tree Depth**: 20 (supports ~1M citizens)
- **Curve**: BN254 (alt_bn128)
- **Hash Function**: Poseidon
- **Proof System**: Groth16

## Public Inputs
1. `root` - Merkle tree root (current census state)
2. `nullifierHash` - Unique per-census identifier
3. `signalHash` - Hash of the signal (1 = "I'm here")
4. `externalNullifier` - Census scope (prevents cross-scope linking)

## Private Inputs
1. `identityNullifier` - User's secret (from NFC seed)
2. `identityTrapdoor` - Additional entropy
3. `treePathIndices` - Merkle path directions
4. `treeSiblings` - Merkle path siblings
