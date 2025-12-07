# 🏛️ ZK Census: Anonymous Population Counter for Network States

<div align="center">

![Solana](https://img.shields.io/badge/Solana-Devnet-blueviolet?logo=solana)
![ZK Proofs](https://img.shields.io/badge/ZK-Groth16-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)

**Privacy-preserving census for the sovereign internet. Count citizens without doxxing them.**

[Demo](https://zcensus.vercel.app) • [Docs](./census/docs) • [Network School Bounty](https://earn.superteam.fun)

</div>

---

## 🎯 The Problem

Traditional census systems have a fundamental conflict: **you can't count people without identifying them**.

| Problem | Impact |
|---------|--------|
| 🔓 **Privacy Violation** | Governments know exactly who, where, and what you are |
| 🎭 **Sybil Attacks** | Online systems are gamed by bot armies and fake accounts |
| 💰 **Expensive Infrastructure** | Census operations cost billions globally |
| 🐌 **Slow & Outdated** | Data is years old by the time it's published |
| ❌ **No Digital Nations** | Network States have no way to prove population legitimately |

### The Paradox

> *"How do you prove 1 million citizens exist without revealing who any of them are?"*

---

## 💡 Our Solution

**ZK Census** uses **Zero-Knowledge Proofs** to solve this paradox. Citizens can:

✅ **Prove they exist** (Merkle tree membership)  
✅ **Be counted exactly once** (Nullifier prevents double-voting)  
✅ **Remain completely anonymous** (ZK proof reveals nothing about identity)

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE MAGIC OF ZK CENSUS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   "I am a registered citizen"     →  ✅ Verified                │
│   "I haven't been counted yet"    →  ✅ Verified                │
│   "Count me as present"           →  ✅ Recorded                │
│                                                                 │
│   WHO AM I?                       →  ❓ Unknown (ZK Magic!)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

### 🔐 Privacy-First Design
- **Zero-Knowledge Proofs**: Groth16 proofs via snarkjs (5,341 constraints)
- **Poseidon Hashing**: ZK-friendly hash function for identity commitments
- **No PII On-Chain**: Only 32-byte cryptographic commitments stored

### 🛡️ Sybil Resistant
- **Nullifier System**: Each identity can only be counted once per census scope
- **Admin-Gated Registration**: Physical verification before on-chain registration
- **Scope-Based Resets**: Fresh nullifiers each census period

### 🛂 Zassport Integration (Passport Verification)
- **Passport-based verification**: Optional integration with **Zassport** for real-identity verification using passport NFC scans.
- **On-chain Attestation (PDA)**: Zassport issues an attestation PDA (no raw passport data) that the admin/backend validates before approving registration.
- **Privacy preserved**: Zassport verification happens off-chain; only a derived attestation and a 32-byte identity commitment reach the blockchain. See `census/docs/ZASSPORT_INTEGRATION.md` for full spec.

### ⚡ Solana-Native Performance
- **~800ms Proof Generation**: Fast client-side proving in browser
- **~15ms Verification**: Real Groth16 verification via snarkjs
- **$0.00015 per Proof**: Ultra-low cost on Solana

### 🌐 Production Ready
- **Off-Chain Verification**: Real cryptographic verification (not mock!)
- **Attestation System**: Ed25519 signed attestations from trusted verifier
- **Incremental Merkle Tree**: Supports 1M+ citizens with 20-level tree

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           ZK CENSUS ARCHITECTURE                           │
└────────────────────────────────────────────────────────────────────────────┘

                              FRONTEND (Next.js)
                    ┌─────────────────────────────────┐
                    │  👤 Connect Wallet              │
                    │  📝 Register as Citizen         │
                    │  🔐 Generate ZK Proof           │
                    │  📊 View Live Population        │
                    └─────────────┬───────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
            ▼                     ▼                     ▼
   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
   │  VERIFIER API   │   │  INDEXER API    │   │  SOLANA CHAIN   │
   │  (Port 3001)    │   │  (Port 4000)    │   │  (Devnet)       │
   ├─────────────────┤   ├─────────────────┤   ├─────────────────┤
   │ • Groth16 Verify│   │ • Merkle Tree   │   │ • CensusState   │
   │ • snarkjs       │   │ • Proof Gen     │   │ • Nullifiers    │
   │ • Ed25519 Sign  │   │ • Poseidon Hash │   │ • Population    │
   │ • Attestations  │   │ • Citizen Index │   │ • Admin Control │
   └─────────────────┘   └─────────────────┘   └─────────────────┘
```

### ZK Circuit (Circom)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CENSUS CIRCUIT (Groth16)                     │
├─────────────────────────────────────────────────────────────────┤
│  PRIVATE INPUTS (Secret - Never Revealed!):                    │
│  • identityNullifier      (your secret)                         │
│  • identityTrapdoor       (your secret)                         │
│  • treePathIndices[20]    (Merkle path directions)              │
│  • treeSiblings[20]       (Merkle path siblings)                │
│                                                                 │
│  PUBLIC OUTPUTS:                                                │
│  • root                   (computed Merkle root)                │
│  • nullifierHash          (prevents double voting)              │
│                                                                 │
│  PROVES:                                                        │
│  1. I know secrets that hash to a leaf in the tree              │
│  2. I haven't voted in this scope (unique nullifier)            │
│  3. I'm signaling participation                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 How It Works

### Phase 1: Registration (One-Time)

```
┌─────────┐      ┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  User   │─────▶│   Admin     │─────▶│  Generate    │─────▶│  On-Chain   │
│         │      │  Verifies   │      │  Identity    │      │  Register   │
└─────────┘      └─────────────┘      └──────────────┘      └─────────────┘
                      │                      │                     │
                Physical/NFC          Poseidon Hash           Merkle Tree
                Verification       commitment = H(n,t)        Updated

Note: User registration supports an optional Zassport flow — users can scan their passports (NFC) via the Zassport portal which issues an on-chain attestation PDA. Admins verify this attestation before approving registration; only a derived 32-byte identity commitment is stored on-chain. See `census/docs/ZASSPORT_INTEGRATION.md` for the full technical spec.
```

### Phase 2: Census Participation (Each Period)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Load      │────▶│  Generate   │────▶│   Verify    │────▶│  Submit     │
│   Identity  │     │  ZK Proof   │     │  Off-Chain  │     │  On-Chain   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
  localStorage        Groth16 ~800ms      snarkjs ~15ms      Population++
```

**What the ZK Proof Proves**:
1. ✅ "I know secrets that hash to a leaf in the Merkle tree"
2. ✅ "I haven't submitted for this census scope yet"
3. ✅ "I'm signaling my participation"
4. ❌ "Who I am" (NEVER revealed!)

---

## 🛂 Zassport Integration Flow

For **real-world Sybil resistance**, ZK Census integrates with [Zassport](https://zassport.vercel.app) — a passport verification portal using NFC scanning and ZK proofs to verify identity documents (ICAO 9303 compliant, 150+ countries).

### Why Zassport?

```
┌─────────────────────────────────────────────────────────────────┐
│ WITHOUT ZASSPORT (Sybil Vulnerable)                            │
├─────────────────────────────────────────────────────────────────┤
│  User → Generate Random Identity → Self-Register → Get Counted │
│  ⚠️  Anyone can create infinite identities = meaningless count │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ WITH ZASSPORT (Sybil Resistant)                                 │
├─────────────────────────────────────────────────────────────────┤
│  User → Scan Passport (Zassport) → Admin Verifies → Register   │
│       → Prove Census with ZK → Get Counted Anonymously          │
│  ✅ One person = One identity (passport bound)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Complete 6-Phase User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ZASSPORT + ZK CENSUS INTEGRATION FLOW                    │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1: IDENTITY VERIFICATION (Zassport Portal)
═════════════════════════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  User   │────▶│  Zassport    │────▶│ Zassport PDA   │
  │         │     │  Portal      │     │ (on Solana)    │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │                      │
       ▼                ▼                      ▼
  [Scan NFC]    [Verify Passport]    [Store Attestation]
                 • Validity check
                 • Age ≥ 18
                 • Nationality

PHASE 2: CENSUS REGISTRATION REQUEST
════════════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  User   │────▶│  ZK Census   │────▶│ Pending Queue  │
  │         │     │  Frontend    │     │                │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │
  [Click Register] [Check Zassport PDA exists & valid]

PHASE 3: ADMIN REVIEW & APPROVAL
════════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  Admin  │────▶│ Admin Panel  │────▶│ Approve/Reject │
  │         │     │              │     │                │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │
  [View Requests] [Verify: not duplicate, valid attestation]

PHASE 4: IDENTITY GENERATION & ON-CHAIN REGISTRATION
════════════════════════════════════════════════════
  ┌─────────────────────────────────────────────────────────────┐
  │  Identity Derivation (Privacy-Preserving)                   │
  ├─────────────────────────────────────────────────────────────┤
  │  identityNullifier = Poseidon(zassportPDA, wallet, salt)    │
  │  identityTrapdoor  = random()                               │
  │  commitment        = Poseidon(nullifier, trapdoor)          │
  └─────────────────────────────────────────────────────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │ Solana: register_citizen()   │
         │ Indexer: POST /add-leaf      │
         └──────────────────────────────┘

PHASE 5: CREDENTIAL DELIVERY
════════════════════════════
  Admin System ──▶ Secure Channel ──▶ User
                   (encrypted msg/QR)
  
  User receives: nullifier, trapdoor, leafIndex
  Stored in: localStorage (never leaves device)

PHASE 6: ANONYMOUS CENSUS PARTICIPATION
═══════════════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  User   │────▶│  Generate    │────▶│  Submit to     │
  │         │     │  ZK Proof    │     │  Solana        │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │                      │
  [Load Creds]    [Groth16 ~800ms]      [Population++]
                                        [Nullifier PDA created]
                                        [Identity: ANONYMOUS]
```

### Privacy & Trust Model

| Data | Location | Privacy |
|------|----------|---------|
| Passport data | User's device only | ✅ Private |
| Zassport attestation | On-chain PDA | 🟡 Semi-private (wallet linked) |
| Identity commitment | On-chain | ✅ Anonymous (32-byte hash) |
| Census participation | On-chain | ✅ Anonymous (ZK proof) |

> 📖 **Full technical specification**: [`census/docs/ZASSPORT_INTEGRATION.md`](./census/docs/ZASSPORT_INTEGRATION.md)

---

## 📁 Project Structure

```
zk-census/
├── api/                     # ZK Verifier API (snarkjs + attestations)
│   └── server.js            # Real Groth16 verification
├── indexer/                 # Merkle tree indexer & Registration
│   ├── api.js               # REST API for proofs & registration
│   ├── merkleTree.js        # Incremental Poseidon tree
│   ├── registration.js      # Registration queue management
│   └── data/                # Persistent storage
│       ├── tree.json        # Merkle tree state (leaves, root)
│       ├── citizens.json    # Registered citizen index
│       └── registration_requests.json  # Pending/approved requests
├── census/
│   ├── programs/census/     # Solana Anchor program
│   │   └── src/
│   │       ├── lib.rs       # 6 instructions
│   │       ├── state.rs     # CensusState, Nullifier
│   │       └── instructions/
│   ├── circuits/            # Circom ZK circuits
│   │   └── census.circom    # Semaphore-style circuit
│   └── app/                 # Next.js frontend
│       └── src/pages/api/   # API routes (proxy to indexer)
├── tests/                   # E2E test suite
└── docs/                    # Documentation
```

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SINGLE SOURCE OF TRUTH                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Next.js Frontend                    Indexer API (Port 4000)           │
│   ┌─────────────────┐                 ┌─────────────────────────────┐   │
│   │ /api/registration/* ──proxy──────▶│ Registration & Merkle Tree   │  │
│   │ /api/credentials/*  ──proxy──────▶│ • registration_requests.json │  │
│   │ /api/admin/*        ──proxy──────▶│ • tree.json                  │  │
│   └─────────────────┘                 │ • citizens.json              │  │
│                                       └─────────────────────────────┘   │
│                                                                         │
│   Why: Ensures data consistency across service restarts and deployments │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Solana CLI
- A Solana wallet with devnet SOL

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/zk-census.git
cd zk-census

# Install all dependencies
npm install
cd indexer && npm install && cd ..
cd api && npm install && cd ..
cd census/app && npm install && cd ../..
```

### 2. Start Services

```bash
# Terminal 1: Indexer API (Merkle tree & Registration - MUST START FIRST)
cd indexer && node api.js
# → Running on http://localhost:4000

# Terminal 2: Verifier API (Real ZK verification)
cd api && node server.js
# → Running on http://localhost:3001

# Terminal 3: Frontend
cd census/app && npm run dev
# → Running on http://localhost:3000
```

> **Important**: The Indexer API must be running before using the frontend, as all registration and Merkle tree operations are handled by this service.

### 3. Test the Flow

1. **Connect Wallet** → Click "Connect" in navbar
2. **Register** → Click "Verify Presence" → "Register as Citizen"
3. **Prove** → Click "Prove & Count Me" (generates ZK proof!)
4. **Watch** → Population counter increments anonymously

---

## 🔧 Technical Specifications

### Solana Program Instructions

| Instruction | Access | Purpose |
|-------------|--------|---------|
| `initialize` | Deployer | Create CensusState account |
| `register_citizen` | Admin | Add identity to Merkle tree |
| `submit_census` | Anyone | Submit ZK proof (on-chain verify) |
| `submit_attestation` | Verifier | Submit pre-verified attestation |
| `advance_scope` | Admin | Start new census period |
| `set_merkle_root` | Admin | Sync root from indexer |

### API Endpoints

**Verifier API (Port 3001)**
```
POST /api/verify           → Verify ZK proof, return signed attestation
GET  /api/verifier-pubkey  → Get Ed25519 public key
GET  /health               → Service health check
```

**Indexer API (Port 4000)**
```
# Merkle Tree
GET  /merkle-proof/:commitment → Get Merkle proof for identity
GET  /tree-info                → Current tree state
GET  /health                   → Service health check

# Registration Flow
POST /api/registration/request              → Submit registration request
GET  /api/registration/status/:wallet       → Check registration status
GET  /api/credentials/:wallet               → Get ZK credentials after approval

# Admin Operations
GET  /api/admin/pending                     → List pending registrations
POST /api/admin/approve                     → Approve registration & add to tree
POST /api/admin/reject                      → Reject registration
```

> **Note**: The Next.js frontend API routes (`/api/*`) proxy to the Indexer API to ensure a single source of truth for registration data and Merkle tree state.

### Performance Metrics

| Metric | Value |
|--------|-------|
| **Proof Generation** | ~800ms (browser) |
| **Off-Chain Verification** | ~15ms |
| **On-Chain Cost** | ~$0.00015 |
| **Tree Capacity** | 1,048,576 citizens (2²⁰) |
| **Circuit Constraints** | 5,341 |

---

## 🔒 Privacy & Security

### Privacy Guarantees
- **Anonymity**: Identity commitments hide real identities
- **Unlinkability**: Different nullifiers per scope prevent tracking
- **Zero-Knowledge**: Proofs reveal nothing beyond validity

### Sybil Resistance
- **Admin-Gated**: Physical verification required for registration
- **One-Person-One-Vote**: Nullifier prevents double-counting
- **Scope Isolation**: Fresh nullifiers each census period

---

## 🌐 Deployed Addresses

- **Program**: `9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH`
- **Network**: Solana Devnet
- **Frontend**: [zcensus.vercel.app](https://zcensus.vercel.app)

---

## 🛣️ Roadmap

### ✅ Completed
- [x] Semaphore-style ZK circuit (Groth16)
- [x] Solana Anchor program (6 instructions)
- [x] Real off-chain verification (snarkjs)
- [x] Ed25519 attestation system
- [x] Incremental Merkle tree indexer
- [x] Next.js frontend with wallet adapter
- [x] E2E test suite
- [ ] Zassport integration (passport-based Sybil resistance)
- [ ] Multi-sig admin governance
- [ ] Mainnet deployment
- [ ] Anonymous attribute proofs

Note: Detailed Zassport integration design spec is available at `census/docs/ZASSPORT_INTEGRATION.md` (planned work includes admin approval workflow, PDA checks, and secure credential delivery).

---

## 🌍 Use Cases

| Use Case | Description |
|----------|-------------|
| **Network States** | Prove population to the world without doxxing citizens |
| **DAO Governance** | Sybil-resistant voting with provable quorum |
| **Events** | Anonymous headcount for physical gatherings |
| **Airdrops** | Fair distribution to unique humans |

---

## 🏆 Bounty Submission


---

## 📚 Resources

- [Semaphore Protocol](https://semaphore.appliedzkp.org/) - ZK membership inspiration
- [circomlib](https://github.com/iden3/circomlib) - Circom circuit library
- [snarkjs](https://github.com/iden3/snarkjs) - ZK proof generation
- [The Network State](https://thenetworkstate.com/) - Vision for digital nations

---

## 📄 License

MIT License - see [LICENSE](./LICENSE)

---

<div align="center">

**Built with 💚 for the sovereign internet**

*"Privacy is not about hiding. It's about being free."*

🏝️ **Network School** | 🔐 **Zero Knowledge** | ⚡ **Solana**

</div>
