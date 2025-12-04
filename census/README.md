# zk-Census: Privacy-Preserving Population Counter for Network States

> Built for the $30k Network School Bounty 🏝️

A Semaphore-style zero-knowledge census system on Solana that enables **privacy-preserving population counting** for startup societies, digital nations, and Network States.

## 🌿 Overview

zk-Census allows citizens to prove they're members of a community and be counted in periodic censuses **without revealing their identity**. Using Groth16 ZK proofs, citizens can:

1. **Prove membership** in the Merkle tree (they're a registered citizen)
2. **Generate a unique nullifier** (prevents double-counting in the same census)
3. **Signal participation** (e.g., "I'm here this week")

All while maintaining complete privacy - no names, no IDs, just math.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PHYSICAL LAYER                           │
│  [NFC Wristband] → [Admin Scan] → [Identity Commitment]         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       SOLANA ON-CHAIN                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Census State   │  │  Merkle Tree    │  │   Nullifiers    │  │
│  │  (PDA)          │  │  (Compressed)   │  │   (PDAs)        │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                              ↑                                   │
│            [Groth16 Verify via alt_bn128 syscalls]              │
└─────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────────┐
│                      ZK PROOF LAYER                             │
│  [User Secret] + [Merkle Path] → [Circom Circuit] → [Proof]    │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
census/
├── programs/census/          # Anchor program (Rust)
│   └── src/
│       ├── lib.rs            # Program entry
│       ├── instructions/     # IX handlers
│       │   ├── initialize.rs
│       │   ├── register_citizen.rs
│       │   ├── submit_census.rs
│       │   └── advance_scope.rs
│       ├── state.rs          # Account definitions
│       ├── error.rs          # Custom errors
│       └── constants.rs      # Seeds & VK
├── circuits/                 # Circom ZK circuits
│   ├── census.circom         # Main Semaphore-style circuit
│   └── package.json          # snarkjs scripts
├── app/                      # Next.js frontend
│   └── src/
│       ├── pages/            # React pages
│       ├── components/       # UI components
│       └── lib/              # ZK proof & census utils
├── tests/                    # Anchor tests
└── scripts/                  # Setup & deployment
```

## 🚀 Quick Start

### Prerequisites

- Rust 1.70+
- Solana CLI 1.18+
- Anchor 0.32+
- Node.js 18+
- Circom 2.1+

### Setup

```bash
# Clone and enter directory
git clone <repo>
cd census

# Run setup script (installs deps, compiles circuit, builds program)
chmod +x scripts/setup.sh
./scripts/setup.sh

# Or manually:
yarn install
cd circuits && yarn install && yarn build && cd ..
anchor build
```

### Run Tests

```bash
# Start local validator
solana-test-validator

# In another terminal
anchor test
```

### Start Frontend

```bash
cd app
yarn dev
# Open http://localhost:3000
```

## 🔐 How It Works

### 1. Registration (Physical → On-Chain)

```
User arrives → Admin scans NFC → Generate commitment → Add to Merkle tree
```

The admin (gatekeeper) scans the user's NFC wristband and derives:
- `identityNullifier` = Hash(NFC_UID + salt)
- `identityTrapdoor` = Additional entropy
- `commitment` = Poseidon(nullifier, trapdoor)

This commitment is added to the on-chain Merkle tree.

### 2. Census Submission (Private Proof)

```
User fetches Merkle proof → Generates ZK proof → Submits on-chain
```

The user proves:
1. They know a secret (`nullifier`, `trapdoor`) that hashes to a leaf in the tree
2. They haven't submitted for this census scope (unique `nullifierHash`)
3. They're signaling participation (`signal = 1`)

### 3. Verification (On-Chain)

The Anchor program:
1. Verifies the Groth16 proof using `alt_bn128` syscalls
2. Checks the Merkle root matches current state
3. Ensures `nullifierHash` hasn't been used (creates PDA)
4. Increments population counter

## 💰 Cost Analysis

| Operation | Compute Units | Cost (@ $150 SOL) |
|-----------|---------------|-------------------|
| Register Citizen | ~50,000 | ~$0.00003 |
| Submit Census Proof | ~200,000 | ~$0.00012 |
| **Per Proof Total** | | **~$0.00015** |

With SPL Account Compression, storing 1M citizens costs ~$50 vs $2M+ for uncompressed accounts.

## 🛡️ Security

- **Sybil Resistance**: Only admin can register (NFC verification)
- **Privacy**: ZK proofs reveal nothing about identity
- **Double-Vote Prevention**: Nullifier PDAs prevent re-use
- **Scope Isolation**: Nullifiers are scoped to census periods

## 📊 Network State Integration

This census can power:
- **Verifiable Demographics**: "47% are remote workers" (via anonymous attributes)
- **Governance Quorum**: "500+ citizens verified for vote"
- **Resource Allocation**: Population-based distribution
- **Digital Citizenship**: Step 6 of Balaji's Network State framework

## 🧪 Testing ZK Proofs

```bash
# Generate test proof
cd circuits
node -e "
const snarkjs = require('snarkjs');
// ... generate test inputs
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  inputs, 'build/census.wasm', 'build/census_final.zkey'
);
console.log(JSON.stringify({ proof, publicSignals }, null, 2));
"
```

## 🔧 Configuration

### Anchor.toml
```toml
[programs.localnet]
census = "YOUR_PROGRAM_ID"

[provider]
cluster = "localnet"  # or "devnet" / "mainnet-beta"
```

### Environment Variables
```env
NEXT_PUBLIC_ADMIN_PUBKEY=YOUR_ADMIN_PUBKEY
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
```

## 🌍 Deployment

```bash
# Deploy to devnet
solana config set --url devnet
anchor deploy

# Initialize census (in script or frontend)
anchor run initialize
```

## 📜 License

MIT

## 🙏 Acknowledgments

- [Semaphore Protocol](https://semaphore.appliedzkp.org/) - ZK membership primitives
- [groth16-solana](https://github.com/Lightprotocol/groth16-solana) - On-chain verification
- [SPL Account Compression](https://spl.solana.com/account-compression) - Scalable state
- [Balaji Srinivasan](https://thenetworkstate.com/) - Network State vision

---

Built with 💚 for the solarpunk future 🌿
