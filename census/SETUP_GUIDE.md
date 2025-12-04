# zk-Census Setup & Testing Guide

## ✅ What's Working

### Backend (Anchor Program)
- ✅ **Successfully compiled** - `anchor build` passes
- ✅ All 4 instructions implemented:
  - `initialize` - Create census state
  - `register_citizen` - Admin adds citizens to Merkle tree
  - `submit_census` - Citizens submit ZK proofs
  - `advance_scope` - Move to next census period
- ✅ Program structure fixed with proper module organization

### Frontend (Next.js App)
- ✅ All React components created
- ✅ Identity generation working
- ✅ Wallet adapter configured
- ✅ UI/UX with solarpunk theme

## 🔧 What Needs Configuration

### 1. Deploy the Program
```bash
cd /mnt/c/Users/sonis/earn/census/census

# Build the program (already done)
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# This will give you the Program ID - update it in:
# - app/src/lib/census.ts (CENSUS_PROGRAM_ID)
# - Anchor.toml (if changed)
```

### 2. Initialize the Census
```bash
# After deployment, initialize the census state
anchor run initialize-census
```

Or manually:
```typescript
// In a Node script or frontend
import { Connection, PublicKey } from '@solana/web3.js';

const admin = /* your wallet */;
const tx = /* build initialize instruction */;
// Set scope_duration = 604800 (1 week in seconds)
```

### 3. Compile Circom Circuit

**This is the critical missing piece for proof generation!**

```bash
cd circuits

# Download Powers of Tau (1.4GB - one-time download)
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_21.ptau -O pot20_final.ptau

# Compile circuit
circom census.circom --r1cs --wasm --sym -o build

# Generate proving and verification keys
snarkjs groth16 setup build/census.r1cs pot20_final.ptau build/census_0000.zkey

# Contribute to ceremony (for production use)
snarkjs zkey contribute build/census_0000.zkey build/census_final.zkey --name="First contribution"

# Export verification key
snarkjs zkey export verificationkey build/census_final.zkey build/verification_key.json

# Copy outputs to frontend public folder
mkdir -p ../app/public/circuits
cp build/census.wasm ../app/public/circuits/
cp build/census_final.zkey ../app/public/circuits/
cp build/verification_key.json ../app/public/circuits/
```

### 4. Frontend Environment Variables

Create `app/.env.local`:
```bash
# RPC endpoint
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com

# Admin public key (for admin UI access)
NEXT_PUBLIC_ADMIN_PUBKEY=<your_wallet_pubkey>

# Program ID (after deployment)
NEXT_PUBLIC_PROGRAM_ID=<deployed_program_id>
```

### 5. Start Frontend

```bash
cd app
npm install
npm run dev
```

Open http://localhost:3000

## 🎯 Testing Flow

### For Demo/Testing (Without Circuits):

1. **Connect Wallet** - Use Phantom or Solflare on devnet
2. **Generate Test Identity** - Click "Generate Test Identity" button
3. **Admin Registration** - If you're admin, use Admin Panel to register citizens
4. **Submit Proof** - Click "Submit Census Proof"

**Note:** Without compiled circuits, the proof generation will fail. The ZK proof generation requires the Circom circuit files.

### For Full Production Flow:

1. **Admin scans NFC wristband** → generates identity commitment
2. **Admin registers citizen** → adds to Merkle tree via `register_citizen`
3. **Citizen receives identity secrets** → stored securely on device
4. **Citizen generates proof** → using circuit + merkle proof
5. **Citizen submits proof** → verified on-chain via `submit_census`
6. **Population increments** → nullifier prevents double-counting

## 🔒 Current Limitations

### 1. **ZK Verification is Stubbed**
In `submit_census.rs`, the proof verification is currently a placeholder:
```rust
let proof_valid = proof_a.iter().any(|b| *b != 0)
    && proof_b.iter().any(|b| *b != 0)
    && proof_c.iter().any(|b| *b != 0);
```

**To fix:** Integrate actual Groth16 verification using Solana's alt_bn128 syscalls or the `groth16_solana` crate.

### 2. **Merkle Tree Not Integrated**
The program uses simple account storage instead of SPL Account Compression.

**To fix:** Integrate SPL Account Compression for 1M+ citizens:
- Use `ConcurrentMerkleTree` accounts
- Update `register_citizen` to append leaves
- Provide merkle proofs in `submit_census`

### 3. **Circuit Files Not Generated**
The frontend expects these files in `public/circuits/`:
- `census.wasm` - WASM prover
- `census_final.zkey` - Proving key
- `verification_key.json` - Verification key

**To fix:** Run the Circom compilation steps above.

## 📊 Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                       Frontend (Next.js)                 │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Identity  │  │ Proof Button │  │  Admin Panel    │ │
│  │ Generator  │  │  (snarkjs)   │  │  (Register)     │ │
│  └────────────┘  └──────────────┘  └─────────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ Solana RPC
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Anchor Program (census.so)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ initialize   │  │ register_    │  │ submit_      │  │
│  │              │  │ citizen      │  │ census       │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
│  State: CensusState (PDA), Nullifier (PDA)              │
└─────────────────────────────────────────────────────────┘
                         │
                         │ Verification
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Circom Circuit (census.circom)              │
│                                                           │
│  Inputs: identity, merkle proof, nullifier              │
│  Outputs: root, nullifierHash (verified on-chain)       │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Next Steps (Priority Order)

1. **Deploy Program** - Get it on devnet
2. **Compile Circuits** - Enable actual ZK proof generation
3. **Integrate Groth16 Verification** - Replace stub in Rust
4. **Add SPL Account Compression** - Scale to 1M+ citizens
5. **Test End-to-End** - Full flow from registration → proof → count
6. **Deploy to Mainnet** - Production launch

## 💡 Quick Wins

For immediate demo functionality:

1. Use the **IdentityGenerator** component to simulate identities
2. AdminPanel now **saves identity to localStorage** automatically
3. Frontend will show proper error messages when circuits are missing
4. All compilation errors are resolved - program is ready to deploy

## 📝 Notes

- **Program ID**: Currently set to `9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH` (will change after deploy)
- **Merkle Tree Depth**: 20 (supports ~1M citizens)
- **Proof System**: Groth16 over BN254 (alt_bn128)
- **Hash Function**: Poseidon (for identity commitments)

---

**Status**: ✅ Compilation successful | 🔧 Needs circuit setup | 🚀 Ready for deployment testing
