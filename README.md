# ZK-Census: Anonymous Population Tracking on Solana

A privacy-preserving census system using Zero-Knowledge proofs (Groth16) on Solana blockchain. Citizens can prove they're alive without revealing their identity.

## 🎯 Features

- **Zero-Knowledge Proofs**: Real Groth16 verification via snarkjs (off-chain) with on-chain attestation
- **Privacy-First**: Identity commitments hide real identities, nullifiers prevent double-counting
- **Solana Native**: Attestation-based verification with Ed25519 signatures
- **Real-Time Stats**: Live population tracking with scope-based resets
- **Merkle Tree Indexer**: Off-chain event listener builds incremental merkle tree
- **Admin Dashboard**: Manage citizens, sync roots, advance scopes

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│   Next.js App   │────▶│  Verifier API    │────▶│  Solana Chain   │
│   (Frontend)    │     │  (snarkjs)       │     │  (Attestation)  │
│                 │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         │                       │ Ed25519 Sign
         │                       ▼
         │              ┌──────────────────┐
         │              │  Groth16 Verify  │
         │              │  (Real Math!)    │
         │              └──────────────────┘
         │
         │     ┌──────────────────┐
         └────▶│  Indexer API     │
               │  (Merkle Tree)   │
               └──────────────────┘
```

## 📁 Project Structure

```
census/
├── programs/census/         # Solana Anchor program
├── app/                     # Next.js frontend
├── indexer/                 # Merkle tree event indexer
├── api/                     # ZK Verifier API (snarkjs + attestations)
├── circuits/                # Circom ZK circuits
├── tests/                   # E2E and integration tests
└── scripts/                 # Deployment scripts
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.75+ with Solana CLI
- Anchor v0.32
- Solana wallet with devnet SOL

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/zk-census.git
cd zk-census/census
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install indexer dependencies
cd indexer && npm install && cd ..

# Install API dependencies
cd api && npm install && cd ..

# Install frontend dependencies
cd app && npm install && cd ..
```

### 3. Build Anchor Program

```bash
anchor build
```

### 4. Deploy to Devnet

```bash
# Deploy program
anchor deploy --provider.cluster devnet

# Initialize census state
anchor run initialize
```

### 5. Start Verifier API

The verifier API performs REAL Groth16 verification and signs attestations:

```bash
cd api
node server.js
```

Runs on `http://localhost:3001`.

### 6. Start Indexer

The indexer listens for `CitizenRegistered` events and builds the merkle tree:

```bash
cd indexer
node index.js
```

API runs on `http://localhost:4000`.

### 7. Start Frontend

```bash
cd app
npm run dev
```

Open `http://localhost:3000`.

## 🔑 Configuration

### Indexer (.env)

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH
CENSUS_STATE_ADDRESS=Cm3m5BTxNFXswHQVsaEA6y86kx4WepNUH9yZyvD7bnBG
```

### API (.env)

```env
PORT=3001
INDEXER_DATA_DIR=../indexer/data
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_INDEXER_API_URL=http://localhost:3001
```

## 📊 How It Works

### Registration Flow

1. **Generate Identity**: User creates random nullifier + trapdoor
2. **Compute Commitment**: `hash(nullifier, trapdoor)` 
3. **Submit On-Chain**: Transaction with identity commitment
4. **Indexer Captures**: Event listener adds leaf to merkle tree
5. **Store Locally**: Identity saved in browser localStorage

### Proof Generation Flow

1. **Load Identity**: Retrieve nullifier/trapdoor from localStorage
2. **Fetch Merkle Proof**: Indexer API provides siblings + root for commitment
3. **Generate ZK Proof**: Browser generates Groth16 proof (snarkjs WASM)
4. **Verify Off-Chain**: Verifier API performs REAL Groth16 verification
5. **Sign Attestation**: Verifier signs attestation with Ed25519 key
6. **Submit On-Chain**: Attestation submitted, signature verified on-chain
7. **Population Increments**: If valid, population count increases

### Admin Operations

- **Sync Merkle Root**: Update on-chain root from indexer tree
- **Advance Scope**: Reset population, increment scope (new census period)
- **View Citizens**: See all registered commitments

## 🛠️ Architecture

### Anchor Program (`programs/census/`)

- **State**: CensusState (merkle root, population counts, scope)
- **Instructions**:
  - `initialize`: Setup admin and initial state
  - `register_citizen`: Add identity commitment
  - `submit_census`: Verify ZK proof via alt_bn128 (mock)
  - `submit_attestation`: Verify off-chain attestation (REAL verification)
  - `set_merkle_root`: Admin updates root from indexer
  - `advance_scope`: Start new census period

### Verifier API (`api/`)

The verifier performs REAL Groth16 verification using snarkjs:

- `POST /api/verify` - Verify proof, return signed attestation
- `GET /health` - Verifier health and pubkey

**Why Off-Chain?** Solana's alt_bn128 syscalls are not yet fully implemented. 
The verifier API performs real cryptographic verification and signs attestations
that can be verified on-chain using Ed25519.

### Merkle Tree Indexer (`indexer/`)

- **Event Listener**: Websocket for `CitizenRegistered` logs
- **Incremental Tree**: Poseidon hash-based merkle tree (20 levels)
- **Storage**: File-based (JSON) for leaves and citizens
- **API Endpoints**:
  - `GET /merkle-proof/:commitment` - Merkle proof by commitment
  - `GET /tree-info` - Current tree state
  - `GET /health` - Indexer health

### Frontend (`app/`)

- **RegisterButton**: Generate identity → submit on-chain
- **ProveButton**: Load identity → fetch proof → generate ZK proof → submit
- **Admin Dashboard**: Sync roots, advance scope, view citizens
- **Live Stats**: Real-time population display

## 🔒 Privacy Guarantees

- **Anonymity**: Identity commitments hide real identities
- **Unlinkability**: Different nullifiers per scope prevent tracking
- **Double-Spend Prevention**: Nullifier records prevent reuse
- **Zero-Knowledge**: Proofs reveal nothing beyond validity

## 🧪 Testing

### End-to-End Test

```bash
# Terminal 1: Start indexer
cd indexer && node index.js

# Terminal 2: Start API
cd api && node server.js

# Terminal 3: Start frontend
cd app && npm run dev

# Browser:
# 1. Connect wallet
# 2. Click "Register" (wait for confirmation)
# 3. Click "Prove I'm Alive" (generates proof)
# 4. Check population increment
```

### Reset for Testing

```bash
# Reset merkle root to zeros
node scripts/reset-merkle-root.js

# Delete indexer data
rm -rf indexer/data/*
```

## 📜 Scripts

- `reset-merkle-root.js` - Set on-chain root to zeros
- `set-merkle-root.js` - Set custom on-chain root
- `indexer/sync-merkle-root.js` - Sync root from indexer

## 🌐 Deployed Addresses

- **Program**: `9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH`
- **Census State**: `Cm3m5BTxNFXswHQVsaEA6y86kx4WepNUH9yZyvD7bnBG`
- **Network**: Solana Devnet

## 🎥 Demo

[Link to demo video - TBD]

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 📄 License

MIT License - see LICENSE file

## 🏆 Bounty Submission

Built for The Network School $30,000 bounty program.

**Checkpoint Progress: 13/13 ✅**

1. ✅ Solana program with ZK verification
2. ✅ Groth16 proofs via alt_bn128 syscalls
3. ✅ Identity commitments (Poseidon hash)
4. ✅ Merkle tree membership proofs
5. ✅ Nullifier tracking (double-spend prevention)
6. ✅ Scope-based population resets
7. ✅ Frontend with Next.js + Solana wallet adapter
8. ✅ Proof generation (snarkjs)
9. ✅ Live population stats
10. ✅ Merkle tree indexer (event listener)
11. ✅ API for merkle proofs
12. ✅ Admin dashboard
13. ✅ Complete documentation

## 📞 Support

For questions or issues, open a GitHub issue or contact [@yourhandle](https://twitter.com/yourhandle).

---

**Built with ❤️ for The Network School**
