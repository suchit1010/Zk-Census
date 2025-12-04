import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPoseidon } from 'circomlibjs';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Dynamic import for snarkjs
let snarkjs;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.resolve(__dirname, process.env.INDEXER_DATA_DIR || '../indexer/data');

app.use(cors());
app.use(express.json({ limit: '10mb' })); // ZK proofs can be large

let poseidon = null;
let verificationKey = null;
let verifierKeypair = null;
const verifiedNullifiers = new Set(); // Track used nullifiers (use DB in production)

// Initialize Poseidon
async function initPoseidon() {
  poseidon = await buildPoseidon();
  console.log('✅ Poseidon initialized');
}

// Initialize snarkjs
async function initSnarkjs() {
  snarkjs = await import('snarkjs');
  console.log('✅ SnarkJS initialized');
}

// Initialize verification key
async function initVerificationKey() {
  try {
    const vkeyPath = path.join(__dirname, '../census/circuits/build/verification_key.json');
    const data = await fs.readFile(vkeyPath, 'utf-8');
    verificationKey = JSON.parse(data);
    console.log('✅ Verification key loaded');
  } catch (err) {
    console.error('⚠️  Verification key not found. ZK verification will fail.');
    console.log('   Run: cd census/circuits && npm run build');
  }
}

// Initialize or load verifier keypair
async function initVerifierKeypair() {
  const keypairPath = path.join(__dirname, 'verifier-keypair.json');
  try {
    const data = await fs.readFile(keypairPath, 'utf-8');
    const secretKey = new Uint8Array(JSON.parse(data));
    verifierKeypair = Keypair.fromSecretKey(secretKey);
    console.log('✅ Loaded verifier keypair:', verifierKeypair.publicKey.toBase58());
  } catch (err) {
    // Generate new keypair
    verifierKeypair = Keypair.generate();
    await fs.writeFile(keypairPath, JSON.stringify(Array.from(verifierKeypair.secretKey)));
    console.log('✅ Generated new verifier keypair:', verifierKeypair.publicKey.toBase58());
  }
}

// Helper: Convert BigInt to 32-byte array (little-endian for Solana)
function bigintToBytes32(value) {
  const bytes = new Uint8Array(32);
  let temp = BigInt(value);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(temp & 0xFFn);
    temp >>= 8n;
  }
  return bytes;
}

// Load data files
async function loadTreeData() {
  const data = await fs.readFile(path.join(DATA_DIR, 'tree.json'), 'utf-8');
  return JSON.parse(data);
}

async function loadCitizens() {
  const data = await fs.readFile(path.join(DATA_DIR, 'citizens.json'), 'utf-8');
  return JSON.parse(data);
}

// Compute merkle proof
function computeMerkleProof(leaves, leafIndex, levels = 20) {
  const zeros = [];
  let currentZero = 0n;
  zeros.push(currentZero);
  
  for (let i = 0; i < levels; i++) {
    const hash = poseidon([currentZero, currentZero]);
    currentZero = BigInt(poseidon.F.toString(hash));
    zeros.push(currentZero);
  }

  const pathElements = [];
  const pathIndices = [];
  let currentIndex = leafIndex;
  const nodes = leaves.map(l => BigInt(l));

  for (let level = 0; level < levels; level++) {
    const isLeft = currentIndex % 2 === 0;
    const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
    
    let sibling;
    if (siblingIndex < nodes.length) {
      sibling = nodes[siblingIndex];
    } else {
      sibling = zeros[level];
    }
    
    pathElements.push(sibling.toString());
    pathIndices.push(isLeft ? 0 : 1);
    
    // Build next level
    const levelSize = Math.ceil(nodes.length / 2);
    const nextLevel = [];
    
    for (let i = 0; i < levelSize; i++) {
      const left = nodes[2 * i] !== undefined ? nodes[2 * i] : zeros[level];
      const right = nodes[2 * i + 1] !== undefined ? nodes[2 * i + 1] : zeros[level];
      const hash = poseidon([left, right]);
      nextLevel.push(BigInt(poseidon.F.toString(hash)));
    }
    
    nodes.splice(0, nodes.length, ...nextLevel);
    currentIndex = Math.floor(currentIndex / 2);
  }

  // Compute root
  let root = nodes[0].toString();

  return {
    pathElements,
    pathIndices,
    root,
    leaf: leaves[leafIndex]
  };
}

// Get merkle root
app.get('/api/merkle-root', async (req, res) => {
  try {
    const treeData = await loadTreeData();
    
    if (treeData.leaves.length === 0) {
      return res.json({ root: '0', leafCount: 0 });
    }
    
    const proof = computeMerkleProof(treeData.leaves, 0, treeData.levels);
    
    res.json({
      root: proof.root,
      leafCount: treeData.leaves.length
    });
  } catch (error) {
    console.error('Error getting root:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get merkle proof by leaf index
app.get('/api/merkle-proof/:leafIndex', async (req, res) => {
  try {
    const leafIndex = parseInt(req.params.leafIndex);
    const treeData = await loadTreeData();
    
    if (leafIndex >= treeData.leaves.length) {
      return res.status(404).json({ error: 'Leaf index out of bounds' });
    }
    
    const proof = computeMerkleProof(treeData.leaves, leafIndex, treeData.levels);
    
    res.json({
      leafIndex,
      leaf: proof.leaf,
      pathElements: proof.pathElements,
      pathIndices: proof.pathIndices,
      root: proof.root
    });
  } catch (error) {
    console.error('Error generating proof:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get merkle proof by commitment
app.get('/api/merkle-proof-by-commitment/:commitment', async (req, res) => {
  try {
    const commitment = req.params.commitment;
    const citizens = await loadCitizens();
    const citizen = citizens.find(c => c.commitment === commitment);
    
    if (!citizen) {
      return res.status(404).json({ error: 'Commitment not found' });
    }
    
    const treeData = await loadTreeData();
    const proof = computeMerkleProof(treeData.leaves, citizen.leafIndex, treeData.levels);
    
    res.json({
      leafIndex: citizen.leafIndex,
      leaf: proof.leaf,
      pathElements: proof.pathElements,
      pathIndices: proof.pathIndices,
      root: proof.root,
      citizen
    });
  } catch (error) {
    console.error('Error generating proof:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all citizens
app.get('/api/citizens', async (req, res) => {
  try {
    const citizens = await loadCitizens();
    res.json({ citizens, count: citizens.length });
  } catch (error) {
    console.error('Error getting citizens:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get citizen by index
app.get('/api/citizens/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const citizens = await loadCitizens();
    
    if (index >= citizens.length) {
      return res.status(404).json({ error: 'Citizen not found' });
    }
    
    res.json(citizens[index]);
  } catch (error) {
    console.error('Error getting citizen:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    verifierPubkey: verifierKeypair?.publicKey?.toBase58() || null,
    hasVerificationKey: !!verificationKey,
    verifiedCount: verifiedNullifiers.size
  });
});

// Get verifier public key (needed by frontend & Solana program)
app.get('/api/verifier-pubkey', (req, res) => {
  res.json({
    pubkey: verifierKeypair.publicKey.toBase58(),
    pubkeyBytes: Array.from(verifierKeypair.publicKey.toBytes())
  });
});

/**
 * MAIN ZK VERIFICATION ENDPOINT
 * 
 * This is where REAL ZK verification happens!
 * 
 * Input: { proof, publicSignals }
 * Output: Signed attestation if proof is valid
 */
app.post('/api/verify', async (req, res) => {
  try {
    const { proof, publicSignals } = req.body;

    console.log('\n📥 Received ZK verification request');

    // Validate inputs
    if (!proof || !publicSignals) {
      return res.status(400).json({
        success: false,
        error: 'Missing proof or publicSignals'
      });
    }

    if (!verificationKey) {
      return res.status(500).json({
        success: false,
        error: 'Verification key not loaded. Circuits may not be compiled.'
      });
    }

    if (!snarkjs) {
      return res.status(500).json({
        success: false,
        error: 'SnarkJS not initialized'
      });
    }

    // Extract public inputs
    // Order from circuit: [root, nullifierHash, signalHash, externalNullifier]
    const [root, nullifierHash, signalHash, externalNullifier] = publicSignals;

    console.log('   📊 Public Signals:');
    console.log('      Merkle Root:', root?.toString().slice(0, 20) + '...');
    console.log('      Nullifier Hash:', nullifierHash?.toString().slice(0, 20) + '...');
    console.log('      Signal Hash:', signalHash?.toString().slice(0, 20) + '...');
    console.log('      External Nullifier:', externalNullifier);

    // Check if nullifier already used (prevents double-voting)
    const nullifierKey = `${externalNullifier}_${nullifierHash}`;
    if (verifiedNullifiers.has(nullifierKey)) {
      console.log('   ❌ Nullifier already used!');
      return res.status(400).json({
        success: false,
        error: 'This identity has already submitted a census proof for this scope'
      });
    }

    // =====================================================
    // REAL GROTH16 ZK PROOF VERIFICATION 🔐
    // =====================================================
    console.log('\n   🔐 Verifying Groth16 proof with snarkjs...');
    
    const startTime = Date.now();
    let isValid;
    try {
      isValid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
    } catch (verifyErr) {
      console.error('   ❌ Verification threw error:', verifyErr.message);
      return res.status(400).json({
        success: false,
        error: `Proof verification error: ${verifyErr.message}`
      });
    }
    const verifyTime = Date.now() - startTime;
    
    console.log(`   ⏱️  Verification took: ${verifyTime}ms`);

    if (!isValid) {
      console.log('   ❌ PROOF INVALID!');
      return res.status(400).json({
        success: false,
        error: 'Invalid ZK proof - cryptographic verification failed'
      });
    }

    console.log('   ✅ PROOF VALID! Creating attestation...');

    // =====================================================
    // Create signed attestation
    // =====================================================
    
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Convert BigInt strings to 32-byte arrays
    const rootBytes = bigintToBytes32(root);
    const nullifierHashBytes = bigintToBytes32(nullifierHash);
    const externalNullifierBytes = bigintToBytes32(externalNullifier);
    const signalHashBytes = bigintToBytes32(signalHash);
    
    // Create message to sign
    const timestampBytes = new Uint8Array(8);
    new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(timestamp), true);
    
    const message = new Uint8Array([
      ...timestampBytes,
      ...rootBytes,
      ...nullifierHashBytes,
      ...externalNullifierBytes,
      ...signalHashBytes
    ]);

    // Sign with Ed25519 (Solana's signature scheme)
    const signature = nacl.sign.detached(message, verifierKeypair.secretKey);

    // Mark nullifier as used
    verifiedNullifiers.add(nullifierKey);

    console.log('   ✅ Attestation signed successfully!');
    console.log('   📝 Signature:', bs58.encode(signature).slice(0, 20) + '...');

    // Return attestation
    res.json({
      success: true,
      attestation: {
        timestamp,
        merkleRoot: root.toString(),
        nullifierHash: nullifierHash.toString(),
        externalNullifier: externalNullifier.toString(),
        signalHash: signalHash.toString(),
        signature: Array.from(signature),
        signatureBase58: bs58.encode(signature),
        verifierPubkey: verifierKeypair.publicKey.toBase58(),
        message: Array.from(message),
        // For Solana instruction
        rootBytes: Array.from(rootBytes),
        nullifierHashBytes: Array.from(nullifierHashBytes),
        externalNullifierBytes: Array.from(externalNullifierBytes)
      },
      verificationTimeMs: verifyTime
    });

  } catch (err) {
    console.error('❌ Verification error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Start server
async function start() {
  console.log('\n🚀 Starting ZK Census Verifier Server...\n');
  
  await initPoseidon();
  await initSnarkjs();
  await initVerificationKey();
  await initVerifierKeypair();
  
  app.listen(PORT, () => {
    console.log(`\n✅ Census API Server running on http://localhost:${PORT}`);
    console.log(`📂 Data directory: ${DATA_DIR}`);
    console.log(`\n📍 Endpoints:`);
    console.log(`   GET  /health                              - Server status`);
    console.log(`   GET  /api/verifier-pubkey                 - Get verifier public key`);
    console.log(`   POST /api/verify                          - Verify ZK proof (REAL!)`);
    console.log(`   GET  /api/merkle-root                     - Get current merkle root`);
    console.log(`   GET  /api/merkle-proof/:leafIndex         - Get merkle proof by index`);
    console.log(`   GET  /api/merkle-proof-by-commitment/:c   - Get merkle proof by commitment`);
    console.log(`   GET  /api/citizens                        - List all citizens`);
    console.log(`\n🔑 Verifier Public Key: ${verifierKeypair.publicKey.toBase58()}`);
    console.log(`   (This key should be added to Solana program as trusted verifier)\n`);
  });
}

start().catch(console.error);
