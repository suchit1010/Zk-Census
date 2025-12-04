# 📋 ZK Census - Pending Services & Development Tracker

> **Status Report: December 4, 2025**

---

## ✅ COMPLETED SERVICES

### 1. Solana Program (`programs/census/`)
| Component | Status | Notes |
|-----------|--------|-------|
| `initialize` instruction | ✅ | Creates CensusState PDA |
| `register_citizen` instruction | ✅ | Admin-gated, emits event |
| `submit_census` instruction | ✅ | Real Groth16 verification |
| `submit_attestation` instruction | ✅ | Off-chain verified proofs |
| `advance_scope` instruction | ✅ | Reset census period |
| `set_merkle_root` instruction | ✅ | Sync on-chain root |
| CensusState account | ✅ | Stores state |
| Nullifier PDA | ✅ | Prevents double voting |

### 2. ZK Circuits (`circuits/`)
| Component | Status | Notes |
|-----------|--------|-------|
| `census.circom` | ✅ | Semaphore-style circuit |
| Merkle tree inclusion proof | ✅ | 20-depth tree |
| Identity commitment generation | ✅ | Poseidon hash |
| Nullifier hash generation | ✅ | Scope-bound |
| `census.wasm` | ✅ | WASM prover compiled |
| `census_final.zkey` | ✅ | Proving key generated |
| `verification_key.json` | ✅ | Verification key exported |

### 3. Verifier API (`api/`)
| Component | Status | Notes |
|-----------|--------|-------|
| Server setup (port 3001) | ✅ | Express with CORS |
| `/api/verify` endpoint | ✅ | REAL Groth16 verification |
| Ed25519 attestation signing | ✅ | For on-chain submission |
| Nullifier tracking | ✅ | In-memory (use DB for production) |
| snarkjs integration | ✅ | Dynamic import |

### 4. Indexer API (`indexer/`)
| Component | Status | Notes |
|-----------|--------|-------|
| Server setup (port 4000) | ✅ | Express with CORS |
| `/add-leaf` endpoint | ✅ | Add identity to tree |
| `/merkle-proof/:commitment` | ✅ | Generate Merkle proofs |
| `/tree-info` endpoint | ✅ | Current tree state |
| Incremental Merkle tree | ✅ | Off-chain tree builder |
| JSON file storage | ✅ | `data/tree.json`, `data/citizens.json` |

---

## 🚧 PENDING SERVICES (For Zassport Integration)

### 1. Zassport Verification Service [NEW]
**Priority: HIGH** ✅ IMPLEMENTED

```
Location: indexer/registration.js
Purpose: Verify Zassport attestation PDAs before registration
```

| Component | Status | Description |
|-----------|--------|-------------|
| PDA reader utility | ✅ DONE | Mock verification (ready for real PDA fetch) |
| Attestation validator | ✅ DONE | Check `isValid`, `isAdult`, `expiresAt` |
| Eligibility checker | ✅ DONE | Determine if user can register for census |
| API endpoint | ✅ DONE | `GET /api/zassport/verify/:wallet` |

### 2. Registration Request Queue [NEW]
**Priority: HIGH** ✅ IMPLEMENTED

```
Location: indexer/registration.js
Purpose: Queue and manage registration requests before admin approval
```

| Component | Status | Description |
|-----------|--------|-------------|
| Request database | ✅ DONE | JSON storage for pending requests |
| `POST /api/registration/request` | ✅ DONE | Submit registration request |
| `GET /api/registration/pending` | ✅ DONE | List pending requests (admin) |
| `POST /api/admin/approve` | ✅ DONE | Admin approves request |
| `POST /api/admin/reject` | ✅ DONE | Admin rejects request |
| Auto-check Zassport | ✅ DONE | Validate attestation on request |

### 3. Admin Dashboard [PARTIAL]
**Priority: MEDIUM** ✅ IMPLEMENTED

```
Location: app/src/pages/admin.tsx
Purpose: Admin UI for managing registration requests
```

| Component | Status | Description |
|-----------|--------|-------------|
| Basic AdminPanel | ✅ DONE | Full dashboard created |
| Pending requests list | ✅ DONE | Show registration queue |
| Zassport verification display | ✅ DONE | Show attestation details |
| Approve/Reject buttons | ✅ DONE | Process requests |
| Registered citizens list | 🟡 Partial | Stats only |
| Census statistics | ✅ DONE | Population, proofs, etc. |
| Advance scope button | ❌ TODO | UI exists, no functionality |

### 4. User Registration Flow [REWORK]
**Priority: HIGH** ✅ IMPLEMENTED

```
Location: app/src/components/ZassportRegistration.tsx
Purpose: Update registration to require Zassport attestation
```

| Component | Status | Description |
|-----------|--------|-------------|
| Zassport check component | ✅ DONE | Verify attestation UI |
| Registration request form | ✅ DONE | Submit request with wallet |
| Status tracker | ✅ DONE | Show pending/approved/rejected |
| Credential receiver | 🟡 Partial | Basic flow implemented |

### 5. Identity Derivation Service [NEW]
**Priority: HIGH** ✅ IMPLEMENTED

```
Location: indexer/registration.js (IdentityGenerator class)
Purpose: Derive Sybil-resistant identity from Zassport attestation
```

| Component | Status | Description |
|-----------|--------|-------------|
| Nullifier derivation | ✅ DONE | `SHA256(zassportPDA, wallet, salt)` |
| Trapdoor generation | ✅ DONE | Secure random |
| Commitment computation | ✅ DONE | `Poseidon(nullifier, trapdoor)` |
| Credential encryption | ✅ DONE | AES-256-CBC encryption |
| Duplicate detection | ✅ DONE | Check if wallet already registered |

### 6. Credential Delivery System [NEW]
**Priority: MEDIUM**

```
Location: app/src/components/CredentialReceiver.tsx
Purpose: Deliver identity credentials to user after admin approval
```

| Component | Status | Description |
|-----------|--------|-------------|
| QR code display | ❌ TODO | Encrypted credentials as QR |
| Wallet-encrypted message | ❌ TODO | Encrypt with user's public key |
| Import credentials | ❌ TODO | User imports to localStorage |
| Verify credentials | ❌ TODO | Test proof generation |

---

## 🔧 INFRASTRUCTURE PENDING

### 1. Database for Persistent Storage
**Priority: MEDIUM**

| Component | Status | Description |
|-----------|--------|-------------|
| SQLite or PostgreSQL | ❌ TODO | Replace JSON file storage |
| Registration requests table | ❌ TODO | Pending, approved, rejected |
| Used nullifiers table | ❌ TODO | Persistent nullifier tracking |
| Audit log | ❌ TODO | Admin actions, registrations |

### 2. WebSocket for Real-time Updates
**Priority: LOW**

| Component | Status | Description |
|-----------|--------|-------------|
| WS server in indexer | 🟡 Partial | Code exists but unstable |
| Tree update notifications | ❌ TODO | New leaf added events |
| Census submission notifications | ❌ TODO | Population updates |

### 3. On-Chain Event Listener
**Priority: MEDIUM**

| Component | Status | Description |
|-----------|--------|-------------|
| Program event parser | ❌ TODO | Parse `CitizenRegistered`, `CensusCounted` |
| Auto-sync with indexer | ❌ TODO | Add leaves from on-chain events |
| Merkle root sync | ❌ TODO | Update on-chain root from indexer |

---

## 📊 BOUNTY CHECKLIST ALIGNMENT

Based on `PROJECT_STATUS.md`:

| # | Checkpoint | Status | Notes |
|---|------------|--------|-------|
| 1 | Program builds & deploys | ✅ | Deployed to devnet |
| 2 | On-chain Merkle tree exists | ✅ | Events + off-chain indexer |
| 3 | Admin can register citizens | 🟡 | Works but no Zassport check |
| 4 | User can generate ZK proof | ✅ | snarkjs in browser |
| 5 | User can submit proof | ✅ | Real Groth16 verification |
| 6 | Double-spending impossible | ✅ | Nullifier PDAs |
| 7 | No personal data on-chain | ✅ | Only 32-byte commitments |
| 8 | Population counter verifiable | ✅ | `current_population` field |
| 9 | Proof generation fast & cheap | ✅ | ~800ms, ~$0.00005 |
| 10 | Weekly census works | ✅ | `advance_scope` instruction |
| 11 | Full demo video | ❌ TODO | Need to record |
| 12 | GitHub repo public | ❌ TODO | Need to push |
| 13 | One-sentence explanation | ✅ | In README |

**Bounty Critical Path:**
1. ✅ Core functionality complete
2. 🟡 Zassport integration (identity verification layer)
3. ❌ Demo video
4. ❌ Public repo

---

## 🛠️ DEVELOPMENT PRIORITY ORDER

### Phase 1: Complete Zassport Integration (2-3 days)
1. Create Zassport verification service
2. Build registration request API
3. Update admin dashboard
4. Rework user registration flow

### Phase 2: Polish & Testing (1-2 days)
1. End-to-end testing
2. Error handling improvements
3. UI/UX polish

### Phase 3: Documentation & Demo (1 day)
1. Record demo video
2. Update README
3. Push to public repo

---

## 📁 File Structure After Implementation

```
census/
├── api/                        # Verifier API (port 3001)
│   ├── server.js               ✅ Exists
│   └── zassport/               ❌ TODO
│       ├── verifier.js         # Zassport PDA verification
│       └── types.ts            # TypeScript types
├── indexer/                    # Indexer API (port 4000)
│   ├── api.js                  ✅ Exists
│   ├── merkleTree.js           ✅ Exists
│   ├── storage.js              ✅ Exists
│   ├── registration.js         ❌ TODO - Registration queue
│   └── identity.js             ❌ TODO - Identity derivation
├── app/
│   └── src/
│       ├── pages/
│       │   ├── index.tsx       🟡 Needs rework
│       │   ├── admin.tsx       ❌ TODO - Full admin dashboard
│       │   └── api/
│       │       ├── registration.ts  ❌ TODO
│       │       └── zassport.ts      ❌ TODO
│       └── components/
│           ├── AdminPanel.tsx  🟡 Needs update
│           ├── RegistrationRequest.tsx  ❌ TODO
│           ├── CredentialReceiver.tsx   ❌ TODO
│           └── ZassportStatus.tsx       ❌ TODO
└── docs/
    └── ZASSPORT_INTEGRATION.md ✅ Created
```

---

*Last Updated: December 4, 2025*
