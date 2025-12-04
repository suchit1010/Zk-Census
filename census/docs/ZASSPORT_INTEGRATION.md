# 🛂 Zassport + ZK Census Integration Architecture

> **Complete Technical Specification for Privacy-Preserving Census with Real Identity Verification**

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Solution Architecture](#solution-architecture)
4. [System Components](#system-components)
5. [Integration Flow](#integration-flow)
6. [IDL Analysis](#idl-analysis)
7. [Data Flow Diagrams](#data-flow-diagrams)
8. [API Specifications](#api-specifications)
9. [Security Considerations](#security-considerations)
10. [Implementation Roadmap](#implementation-roadmap)

---

## 📌 Executive Summary

**ZK Census** is a privacy-preserving population counter for Network States built on Solana. It uses Semaphore-style ZK proofs to enable citizens to be counted without revealing their identity.

**Zassport** is a passport verification portal that uses NFC scanning and ZK proofs to verify real-world identity documents (ICAO 9303 compliant passports from 150+ countries).

**The Integration** combines these two systems to create a **Sybil-resistant, privacy-preserving census** where:
- Real identity is verified OFF-CHAIN via Zassport
- Only cryptographic commitments exist ON-CHAIN
- Zero personal data touches the blockchain

---

## ❓ Problem Statement

### Current ZK Census Flow (INCORRECT)

```
┌─────────────────────────────────────────────────────────────────┐
│ CURRENT FLOW (No Identity Verification)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User → Generate Random Identity → Self-Register → Get Counted │
│                                                                 │
│  ⚠️ PROBLEMS:                                                   │
│  • Anyone can create infinite identities                       │
│  • No proof of real personhood                                  │
│  • Sybil attacks possible                                       │
│  • Census count is meaningless                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### With Zassport Integration (CORRECT)

```
┌─────────────────────────────────────────────────────────────────┐
│ CORRECT FLOW (Real Identity Verification)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User → Scan Passport (Zassport) → Admin Verifies → Register   │
│       → Prove Census with ZK → Get Counted Anonymously          │
│                                                                 │
│  ✅ SOLVED:                                                      │
│  • One person = One identity (passport bound)                   │
│  • Real personhood verified                                     │
│  • Sybil resistant                                              │
│  • Census count is meaningful                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Solution Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ZASSPORT + ZK CENSUS INTEGRATION                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │    ZASSPORT      │    │    ZK CENSUS     │    │     SOLANA       │      │
│  │    (Portal)      │    │    (Backend)     │    │   (On-Chain)     │      │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤      │
│  │ • NFC Scan       │───▶│ • Admin Panel    │───▶│ • Commitments    │      │
│  │ • Passport ZK    │    │ • Registration   │    │ • Merkle Root    │      │
│  │ • Age Proofs     │    │ • Indexer API    │    │ • Nullifiers     │      │
│  │ • Nationality    │    │ • Verifier API   │    │ • Population     │      │
│  │ • Validity Check │    │ • ZK Circuits    │    │                  │      │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘      │
│           │                       │                       │                 │
│           ▼                       ▼                       ▼                 │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                     DATA FLOW                                    │       │
│  ├─────────────────────────────────────────────────────────────────┤       │
│  │  Passport Data ──▶ Zassport Attestation ──▶ ZK Identity ──▶     │       │
│  │  (NFC Chip)        (Off-Chain PDA)          (32-byte)    Chain  │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 System Components

### 1. Zassport Portal (`zassport.vercel.app`)

| Feature | Description |
|---------|-------------|
| **NFC Passport Scan** | Reads MRZ data from passport's NFC chip |
| **ICAO 9303 Compliant** | Supports 150+ countries |
| **ZK Proof Generation** | Creates proofs for age, nationality, validity |
| **On-Chain Attestation** | Stores verification result as PDA |
| **Privacy Preserving** | No raw passport data on-chain |

**Zassport Attestation PDA Structure:**
```typescript
interface ZassportAttestation {
  // PDA seeds: ["zassport", walletPubkey, passportHash]
  walletPubkey: PublicKey;      // User's wallet
  passportHash: [u8; 32];       // Hash of passport data
  isValid: boolean;             // Passport validity verified
  isAdult: boolean;             // Age >= 18 verified
  nationality: string;          // 3-letter country code (optional)
  verifiedAt: i64;              // Unix timestamp
  expiresAt: i64;               // Attestation expiry
}
```

### 2. ZK Census Solana Program

**Program ID:** `9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH`

**Instructions:**
| Instruction | Purpose | Access |
|-------------|---------|--------|
| `initialize` | Create CensusState PDA | Once (deployer) |
| `register_citizen` | Add identity commitment | Admin only |
| `submit_census` | Submit ZK proof, increment count | Anyone (with valid proof) |
| `submit_attestation` | Alternative: off-chain verified proof | Verifier only |
| `advance_scope` | Change census period (reset nullifiers) | Admin only |
| `set_merkle_root` | Sync on-chain root with indexer | Admin only |

**Accounts:**
| Account | Type | Description |
|---------|------|-------------|
| `CensusState` | PDA | `admin`, `merkle_root`, `current_population`, `census_scope`, etc. |
| `Nullifier` | PDA | `nullifier_hash` - prevents double voting |

### 3. Indexer API (Port 4000)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/add-leaf` | POST | Add identity commitment to Merkle tree |
| `/merkle-proof/:commitment` | GET | Get Merkle proof for identity |
| `/tree-info` | GET | Get current tree state |
| `/health` | GET | Health check |

### 4. Verifier API (Port 3001)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/verify` | POST | REAL Groth16 ZK proof verification |
| `/api/verifier-pubkey` | GET | Get Ed25519 verifier public key |
| `/api/merkle-root` | GET | Get current Merkle root |
| `/api/citizens` | GET | List registered citizens |

### 5. ZK Circuit (`census.circom`)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CENSUS CIRCUIT (Groth16)                     │
├─────────────────────────────────────────────────────────────────┤
│  PRIVATE INPUTS:                                                │
│  • identityNullifier      (secret)                              │
│  • identityTrapdoor       (secret)                              │
│  • treePathIndices[20]    (Merkle path directions)              │
│  • treeSiblings[20]       (Merkle path siblings)                │
│                                                                 │
│  PUBLIC INPUTS:                                                 │
│  • signalHash             (= 1 for "I'm alive")                 │
│  • externalNullifier      (census scope ID)                     │
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

## 🔄 Integration Flow

### Complete User Journey (6 Phases)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE INTEGRATION FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1: IDENTITY VERIFICATION (Zassport)
═════════════════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  User   │────▶│  Zassport    │────▶│ Zassport PDA   │
  │         │     │  Portal      │     │ (on Solana)    │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │                      │
       ▼                ▼                      ▼
  [Scan NFC]    [Verify Passport]    [Store Attestation]
       │                │                      │
       │         ┌──────┴──────┐               │
       │         │ ZK Proof of:│               │
       │         │ • Validity  │               │
       │         │ • Age ≥ 18  │               │
       │         │ • Nationality│              │
       │         └─────────────┘               │
       │                                       │
       └───────────────────────────────────────┘

PHASE 2: CENSUS REGISTRATION REQUEST
═════════════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  User   │────▶│  ZK Census   │────▶│ Pending Queue  │
  │         │     │  Frontend    │     │ (Database)     │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │                      │
       ▼                ▼                      ▼
  [Click Register] [Check Zassport PDA]  [Store Request]
       │                │                      │
       │         ┌──────┴──────┐               │
       │         │ Verify:     │               │
       │         │ • PDA exists│               │
       │         │ • Not expired│              │
       │         │ • isValid=true│             │
       │         └─────────────┘               │
       │                                       │
       └───────────────────────────────────────┘

PHASE 3: ADMIN REVIEW & APPROVAL
════════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  Admin  │────▶│ Admin Panel  │────▶│ Approval Queue │
  │         │     │              │     │                │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │                      │
       ▼                ▼                      ▼
  [View Requests] [Verify Zassport]    [Mark Approved]
       │                │                      │
       │         ┌──────┴──────┐               │
       │         │ Check:      │               │
       │         │ • Not duplicate│            │
       │         │ • Valid wallet │            │
       │         │ • Attestation OK│           │
       │         └─────────────┘               │
       │                                       │
       └───────────────────────────────────────┘

PHASE 4: IDENTITY GENERATION & REGISTRATION
═══════════════════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  Admin  │────▶│ ZK Census    │────▶│ Solana Chain   │
  │  System │     │ Backend      │     │                │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │                      │
       ▼                ▼                      ▼
  [Gen Identity] [Build Commitment]   [register_citizen]
       │                │                      │
       │         ┌──────┴──────────────┐       │
       │         │ identityNullifier = │       │
       │         │   Poseidon(         │       │
       │         │     zassportPDA,    │       │
       │         │     walletPubkey,   │       │
       │         │     adminSalt       │       │
       │         │   )                 │       │
       │         │                     │       │
       │         │ identityTrapdoor =  │       │
       │         │   random()          │       │
       │         │                     │       │
       │         │ commitment =        │       │
       │         │   Poseidon(         │       │
       │         │     nullifier,      │       │
       │         │     trapdoor        │       │
       │         │   )                 │       │
       │         └─────────────────────┘       │
       │                                       │
       └───────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │ INDEXER API     │
              │ POST /add-leaf  │
              │ {commitment}    │
              └─────────────────┘

PHASE 5: CREDENTIAL DELIVERY
════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  Admin  │────▶│ Secure       │────▶│     User       │
  │  System │     │ Channel      │     │                │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │                      │
       ▼                ▼                      ▼
  [Encrypt Creds]  [Send via:]         [Decrypt & Save]
       │           • Encrypted msg           │
       │           • QR code                 │
       │           • DM                      │
       │                                      │
       │         ┌──────────────────┐        │
       │         │ User receives:   │        │
       │         │ • nullifier      │        │
       │         │ • trapdoor       │        │
       │         │ • leafIndex      │        │
       │         └──────────────────┘        │
       │                                      │
       └──────────────────────────────────────┘

PHASE 6: ANONYMOUS CENSUS PARTICIPATION
═══════════════════════════════════════
  ┌─────────┐     ┌──────────────┐     ┌────────────────┐
  │  User   │────▶│ ZK Census    │────▶│ Solana Chain   │
  │         │     │ Frontend     │     │                │
  └─────────┘     └──────────────┘     └────────────────┘
       │                │                      │
       ▼                ▼                      ▼
  [Load Creds]   [Generate Proof]      [submit_census]
       │                │                      │
       │         ┌──────┴──────────────┐       │
       │         │ 1. Fetch Merkle     │       │
       │         │    proof from       │       │
       │         │    Indexer          │       │
       │         │                     │       │
       │         │ 2. Generate         │       │
       │         │    Groth16 proof    │       │
       │         │    (~800ms)         │       │
       │         │                     │       │
       │         │ 3. Verify via       │       │
       │         │    Verifier API     │       │
       │         │                     │       │
       │         │ 4. Submit to        │       │
       │         │    Solana           │       │
       │         └─────────────────────┘       │
       │                                       │
       │         ┌──────────────────┐          │
       │         │ RESULT:          │          │
       │         │ • Population++   │          │
       │         │ • Nullifier PDA  │          │
       │         │   created        │          │
       │         │ • User anonymous │          │
       │         └──────────────────┘          │
       │                                       │
       └───────────────────────────────────────┘
```

---

## 📜 IDL Analysis

### Current IDL (No Changes Needed!)

The critical insight is that **the Solana program IDL doesn't need to change**. Zassport verification happens OFF-CHAIN.

```json
{
  "instructions": [
    {
      "name": "register_citizen",
      "accounts": [
        { "name": "admin", "isMut": true, "isSigner": true },
        { "name": "censusState", "isMut": true },
        { "name": "systemProgram" }
      ],
      "args": [
        { "name": "identityCommitment", "type": { "array": ["u8", 32] } }
      ]
    }
  ]
}
```

**Why no IDL changes?**

| Layer | Responsibility | Zassport Data? |
|-------|---------------|----------------|
| Zassport | Verify passport, create attestation PDA | YES (off-chain) |
| Admin Backend | Check Zassport PDA, approve registration | NO (reads PDA) |
| ZK Census Program | Store commitment, verify ZK proofs | NO (only 32-byte hash) |

The **identity commitment** is the only thing that goes on-chain, and it's derived from:
- Zassport PDA (proves real identity)
- User wallet (binds to Solana identity)
- Admin salt (prevents external derivation)

---

## 📊 Data Flow Diagrams

### Registration Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REGISTRATION DATA FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

  Passport NFC Data
        │
        ▼
  ┌──────────────────┐
  │   Zassport ZK    │
  │   Circuit        │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐     ┌──────────────────┐
  │ Zassport PDA     │────▶│ Admin Backend    │
  │ (on-chain)       │     │ (reads PDA)      │
  └──────────────────┘     └────────┬─────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │ Derive Identity  │
                           │                  │
                           │ nullifier =      │
                           │   Poseidon(      │
                           │     zassportPDA, │
                           │     wallet,      │
                           │     salt         │
                           │   )              │
                           │                  │
                           │ commitment =     │
                           │   Poseidon(      │
                           │     nullifier,   │
                           │     trapdoor     │
                           │   )              │
                           └────────┬─────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
           ┌──────────────┐                ┌──────────────┐
           │ Solana Chain │                │ Indexer API  │
           │ register_    │                │ /add-leaf    │
           │ citizen()    │                │              │
           └──────────────┘                └──────────────┘
                    │                               │
                    ▼                               ▼
           ┌──────────────┐                ┌──────────────┐
           │ CensusState  │                │ Merkle Tree  │
           │ (event emit) │                │ (off-chain)  │
           └──────────────┘                └──────────────┘
```

### Census Proof Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CENSUS PROOF DATA FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

  User Credentials (localStorage)
  • identityNullifier
  • identityTrapdoor
  • leafIndex
        │
        ▼
  ┌──────────────────┐
  │ Indexer API      │
  │ /merkle-proof/   │
  │   {commitment}   │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Merkle Proof     │
  │ • pathElements   │
  │ • pathIndices    │
  │ • root           │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Census Circuit   │
  │ (snarkjs)        │
  │                  │
  │ INPUTS:          │
  │ • nullifier      │
  │ • trapdoor       │
  │ • pathElements   │
  │ • pathIndices    │
  │ • signalHash=1   │
  │ • extNullifier   │
  │                  │
  │ OUTPUTS:         │
  │ • proof (Groth16)│
  │ • publicSignals  │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Verifier API     │
  │ /api/verify      │
  │                  │
  │ • Groth16 verify │
  │ • Sign attestation│
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Solana Chain     │
  │ submit_census()  │
  │ OR               │
  │ submit_attestation()│
  │                  │
  │ RESULT:          │
  │ • population++   │
  │ • Nullifier PDA  │
  └──────────────────┘
```

---

## 🔌 API Specifications

### New Endpoints Needed

#### 1. Registration Request API

```typescript
// POST /api/registration/request
interface RegistrationRequest {
  walletPubkey: string;         // User's wallet address
  zassportPDA: string;          // Zassport attestation PDA
  requestedAt: number;          // Unix timestamp
}

interface RegistrationResponse {
  success: boolean;
  requestId: string;
  status: 'pending' | 'approved' | 'rejected';
  message?: string;
}
```

#### 2. Admin Approval API

```typescript
// POST /api/admin/approve
interface ApprovalRequest {
  requestId: string;
  adminSignature: string;       // Admin wallet signature
}

interface ApprovalResponse {
  success: boolean;
  identityCommitment: string;   // Generated commitment
  leafIndex: number;            // Position in Merkle tree
  encryptedCredentials: string; // For delivery to user
  txSignature: string;          // Solana tx hash
}
```

#### 3. Zassport Verification API

```typescript
// GET /api/zassport/verify/:walletPubkey
interface ZassportVerificationResponse {
  hasAttestation: boolean;
  attestation?: {
    pda: string;
    isValid: boolean;
    isAdult: boolean;
    nationality?: string;
    verifiedAt: number;
    expiresAt: number;
  };
  eligible: boolean;            // Can register for census?
  reason?: string;              // If not eligible, why
}
```

---

## 🔒 Security Considerations

### Sybil Resistance

| Attack Vector | Mitigation |
|---------------|------------|
| Multiple passports | Each passport has unique hash; one attestation per passport |
| Multiple wallets same passport | Nullifier derived from passport hash + wallet; tracked |
| Fake Zassport attestation | PDAs are on-chain, verified by Census backend |
| Replay attacks | Nullifier scoped to census period |
| Admin collusion | Multi-sig admin wallet (recommended for production) |

### Privacy Guarantees

| Data | Storage Location | Privacy Level |
|------|------------------|---------------|
| Passport data | User's device only | ✅ Private |
| Zassport attestation | On-chain PDA | 🟡 Semi-private (wallet linked) |
| Identity commitment | On-chain + Indexer | ✅ Anonymous (32-byte hash) |
| Nullifier | On-chain | ✅ Anonymous (cannot reverse) |
| Census participation | On-chain | ✅ Anonymous (ZK proof) |

### Trust Model

```
┌─────────────────────────────────────────────────────────────────┐
│                       TRUST MODEL                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TRUST LEVEL          COMPONENT                                 │
│  ───────────          ─────────                                 │
│                                                                 │
│  🔴 Must Trust        Admin (can see pending requests)         │
│                       Zassport service (passport verification) │
│                                                                 │
│  🟡 Partial Trust     Verifier API (sees proofs, not identity) │
│                       Indexer API (sees commitments only)      │
│                                                                 │
│  🟢 Trustless         Solana program (on-chain logic)          │
│                       ZK circuit (math is math)                │
│                       User device (holds secrets)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗺️ Implementation Roadmap

### Phase 1: Backend Updates (Completed Services)

- [x] Solana Program (6 instructions)
- [x] ZK Circuit (census.circom)
- [x] Verifier API (port 3001)
- [x] Indexer API (port 4000)

### Phase 2: Zassport Integration (TODO)

- [ ] Create Zassport verification service
- [ ] Add PDA reading utility functions
- [ ] Create registration request queue (database)
- [ ] Build admin approval workflow

### Phase 3: Frontend Updates (TODO)

- [ ] Remove "Generate Random Identity" button
- [ ] Add Zassport attestation check
- [ ] Create registration request form
- [ ] Build admin dashboard for approvals
- [ ] Add credential delivery UI

### Phase 4: Security Hardening (TODO)

- [ ] Implement multi-sig admin
- [ ] Add rate limiting
- [ ] Create audit logging
- [ ] Run security review

### Phase 5: Production Deployment (TODO)

- [ ] Deploy to mainnet
- [ ] Set up monitoring
- [ ] Create runbooks
- [ ] Record demo video

---

## 📚 References

- [Zassport Portal](https://zassport.vercel.app)
- [Semaphore Protocol](https://semaphore.appliedzkp.org/)
- [ICAO 9303 Standard](https://www.icao.int/publications/pages/publication.aspx?docnum=9303)
- [Groth16 on Solana](https://github.com/Lightprotocol/groth16-solana)
- [Network State Book](https://thenetworkstate.com/)

---

*Last Updated: December 4, 2025*
*Document Version: 1.0*
