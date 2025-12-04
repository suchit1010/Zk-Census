import express from 'express';
import cors from 'cors';
import { Connection } from '@solana/web3.js';
import { Storage } from './storage.js';
import { IncrementalMerkleTree } from './merkleTree.js';
import { 
  RegistrationQueue, 
  ZassportVerifier, 
  IdentityGenerator,
  RequestStatus 
} from './registration.js';

const app = express();
const PORT = 4000;

// Solana connection for Zassport verification
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(SOLANA_RPC);
const zassportVerifier = new ZassportVerifier(connection);

// Admin salt for identity derivation (keep this SECRET in production)
const ADMIN_SALT = process.env.ADMIN_SALT || 'census-admin-salt-change-in-production';
const identityGenerator = new IdentityGenerator(ADMIN_SALT);

app.use(cors());
app.use(express.json());

// Initialize storage on startup
async function initializeStorage() {
  await Storage.initialize();
  await RegistrationQueue.initialize();
  console.log('📦 Storage initialized');
}
initializeStorage().catch(console.error);

// Add a leaf to the tree (called after on-chain registration)
app.post('/add-leaf', async (req, res) => {
  try {
    const { commitment } = req.body;
    
    if (!commitment) {
      return res.status(400).json({ error: 'Missing commitment' });
    }
    
    console.log(`📥 Adding leaf: ${commitment.toString().slice(0, 20)}...`);
    
    // Load current tree data
    const treeData = await Storage.loadTree();
    
    // Check if already exists
    if (treeData.leaves && treeData.leaves.includes(commitment)) {
      console.log(`⚠️ Commitment already exists`);
      return res.json({ 
        success: true, 
        message: 'Already registered',
        leafIndex: treeData.leaves.indexOf(commitment)
      });
    }
    
    // Ensure leaves array exists
    if (!treeData.leaves) {
      treeData.leaves = [];
    }
    
    // Add the new leaf
    treeData.leaves.push(commitment);
    const newLeafIndex = treeData.leaves.length - 1;
    
    // Rebuild tree to get new root
    const tree = new IncrementalMerkleTree();
    await tree.initialize();
    for (const leaf of treeData.leaves) {
      tree.insert(leaf);
    }
    
    const newRoot = tree.getRoot();
    
    // Save updated tree (pass tree instance which has toJSON method)
    await Storage.saveTree(tree);
    
    // Save citizen record
    await Storage.saveCitizen({
      commitment,
      leafIndex: newLeafIndex,
      registeredAt: new Date().toISOString()
    });
    
    console.log(`✅ Leaf added at index ${newLeafIndex}`);
    console.log(`   New root: ${newRoot}`);
    
    res.json({
      success: true,
      leafIndex: newLeafIndex,
      root: newRoot
    });
  } catch (error) {
    console.error('❌ Error adding leaf:', error);
    res.status(500).json({ error: 'Failed to add leaf', message: error.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const treeData = await Storage.loadTree();
    res.json({
      status: 'ok',
      leafCount: treeData.leaves?.length || 0,
      merkleRoot: treeData.root || '0',
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load tree data' });
  }
});

// Get merkle proof for a specific commitment
app.get('/merkle-proof/:commitment', async (req, res) => {
  try {
    const commitment = req.params.commitment;
    console.log(`📥 Proof request for commitment: ${commitment}`);

    // Load tree data
    const treeData = await Storage.loadTree();
    
    if (!treeData.leaves || treeData.leaves.length === 0) {
      console.log(`❌ Tree is empty`);
      return res.status(404).json({ 
        error: 'Tree is empty',
        message: 'No identities have been registered yet'
      });
    }
    
    // Find the commitment in our leaves
    const leafIndex = treeData.leaves.findIndex((leaf) => leaf === commitment);
    
    if (leafIndex === -1) {
      console.log(`❌ Commitment not found in tree`);
      console.log(`   Looking for: ${commitment}`);
      console.log(`   Available leaves: ${treeData.leaves.length}`);
      return res.status(404).json({ 
        error: 'Commitment not found',
        message: 'This identity is not registered in the census'
      });
    }

    // Rebuild tree to get proof
    const tree = new IncrementalMerkleTree();
    await tree.initialize();
    for (const leaf of treeData.leaves) {
      tree.insert(leaf);
    }

    // Generate proof
    const proof = tree.getMerkleProof(leafIndex);
    
    console.log(`✅ Generated proof for leaf ${leafIndex}`);
    console.log(`   Root: ${proof.root}`);
    console.log(`   Path indices: ${proof.pathIndices.join(',')}`);

    res.json({
      commitment,
      leafIndex,
      merkleRoot: proof.root,
      pathElements: proof.pathElements,
      pathIndices: proof.pathIndices,
      treeDepth: 20
    });
  } catch (error) {
    console.error('❌ Error generating proof:', error);
    res.status(500).json({ 
      error: 'Failed to generate proof',
      message: error.message 
    });
  }
});

// Get current tree info
app.get('/tree-info', async (req, res) => {
  try {
    const treeData = await Storage.loadTree();
    
    // Rebuild tree to compute current root
    const tree = new IncrementalMerkleTree();
    await tree.initialize();
    for (const leaf of (treeData.leaves || [])) {
      tree.insert(leaf);
    }
    
    res.json({
      leafCount: treeData.leaves?.length || 0,
      merkleRoot: tree.getRoot(),
      leaves: treeData.leaves || [],
      lastUpdated: new Date().toISOString(),
      treeDepth: 20
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load tree info' });
  }
});

// ============================================================
// REGISTRATION REQUEST ENDPOINTS (Zassport Integration)
// ============================================================

/**
 * Verify Zassport attestation for a wallet
 * GET /api/zassport/verify/:wallet
 */
app.get('/api/zassport/verify/:wallet', async (req, res) => {
  try {
    const wallet = req.params.wallet;
    console.log(`🔍 Verifying Zassport for wallet: ${wallet.slice(0, 8)}...`);
    
    const result = await zassportVerifier.verifyAttestation(wallet);
    
    res.json({
      wallet,
      ...result,
      checkedAt: Date.now()
    });
  } catch (error) {
    console.error('❌ Zassport verification error:', error);
    res.status(500).json({ error: 'Verification failed', message: error.message });
  }
});

/**
 * Submit registration request
 * POST /api/registration/request
 * Body: { walletPubkey: string }
 */
app.post('/api/registration/request', async (req, res) => {
  try {
    const { walletPubkey } = req.body;
    
    if (!walletPubkey) {
      return res.status(400).json({ error: 'Missing walletPubkey' });
    }
    
    console.log(`📝 New registration request from: ${walletPubkey.slice(0, 8)}...`);
    
    // Verify Zassport attestation
    const zassportResult = await zassportVerifier.verifyAttestation(walletPubkey);
    
    if (!zassportResult.eligible) {
      return res.status(400).json({
        success: false,
        error: 'Not eligible for registration',
        reason: zassportResult.reason
      });
    }
    
    // Create registration request
    const request = await RegistrationQueue.createRequest(
      walletPubkey,
      zassportResult.attestation?.pda,
      zassportResult.attestation
    );
    
    console.log(`✅ Request created: ${request.id}`);
    
    res.json({
      success: true,
      request: {
        id: request.id,
        status: request.status,
        walletPubkey: request.walletPubkey,
        requestedAt: request.requestedAt
      },
      message: 'Registration request submitted. Waiting for admin approval.'
    });
    
  } catch (error) {
    console.error('❌ Registration request error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get registration request status
 * GET /api/registration/status/:wallet
 */
app.get('/api/registration/status/:wallet', async (req, res) => {
  try {
    const wallet = req.params.wallet;
    const request = await RegistrationQueue.getRequestByWallet(wallet);
    
    if (!request) {
      return res.json({
        found: false,
        status: null,
        message: 'No registration request found for this wallet'
      });
    }
    
    res.json({
      found: true,
      request: {
        id: request.id,
        status: request.status,
        requestedAt: request.requestedAt,
        processedAt: request.processedAt,
        // If approved, include credentials hint
        hasCredentials: request.status === RequestStatus.APPROVED,
        leafIndex: request.leafIndex,
        rejectionReason: request.rejectionReason
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * Get pending requests (admin only)
 * GET /api/admin/pending
 * Header: X-Admin-Signature (in production)
 */
app.get('/api/admin/pending', async (req, res) => {
  try {
    // TODO: Verify admin signature in production
    const pending = await RegistrationQueue.getPendingRequests();
    const stats = await RegistrationQueue.getStats();
    
    res.json({
      pending,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get pending requests' });
  }
});

/**
 * Approve registration request (admin only)
 * POST /api/admin/approve
 * Body: { requestId: string, adminPubkey: string }
 */
app.post('/api/admin/approve', async (req, res) => {
  try {
    const { requestId, adminPubkey } = req.body;
    
    if (!requestId || !adminPubkey) {
      return res.status(400).json({ error: 'Missing requestId or adminPubkey' });
    }
    
    console.log(`✅ Admin ${adminPubkey.slice(0, 8)}... approving request ${requestId}`);
    
    // Get the request
    const request = await RegistrationQueue.getRequestById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    // Generate identity from Zassport data
    const identity = await identityGenerator.generateIdentity(
      request.walletPubkey,
      request.zassportData?.passportHash || 'default-hash'
    );
    
    // Add to Merkle tree
    const treeData = await Storage.loadTree();
    if (!treeData.leaves) treeData.leaves = [];
    
    treeData.leaves.push(identity.commitment);
    const leafIndex = treeData.leaves.length - 1;
    
    // Rebuild tree
    const tree = new IncrementalMerkleTree();
    await tree.initialize();
    for (const leaf of treeData.leaves) {
      tree.insert(leaf);
    }
    
    // Save tree
    await Storage.saveTree(tree);
    
    // Save citizen record
    await Storage.saveCitizen({
      commitment: identity.commitment,
      leafIndex,
      walletPubkey: request.walletPubkey,
      registeredAt: new Date().toISOString(),
      requestId: request.id
    });
    
    // Update request status
    await RegistrationQueue.approveRequest(
      requestId, 
      adminPubkey, 
      identity.commitment,
      leafIndex
    );
    
    // Encrypt credentials for delivery
    const encryptedCredentials = identityGenerator.encryptCredentials(
      {
        identityNullifier: identity.identityNullifier,
        identityTrapdoor: identity.identityTrapdoor,
        commitment: identity.commitment,
        leafIndex
      },
      request.walletPubkey
    );
    
    console.log(`✅ Request approved, leaf index: ${leafIndex}`);
    
    res.json({
      success: true,
      leafIndex,
      commitment: identity.commitment,
      merkleRoot: tree.getRoot(),
      encryptedCredentials
    });
    
  } catch (error) {
    console.error('❌ Approval error:', error);
    res.status(500).json({ error: 'Approval failed', message: error.message });
  }
});

/**
 * Reject registration request (admin only)
 * POST /api/admin/reject
 * Body: { requestId: string, adminPubkey: string, reason: string }
 */
app.post('/api/admin/reject', async (req, res) => {
  try {
    const { requestId, adminPubkey, reason } = req.body;
    
    if (!requestId || !adminPubkey) {
      return res.status(400).json({ error: 'Missing requestId or adminPubkey' });
    }
    
    console.log(`❌ Admin ${adminPubkey.slice(0, 8)}... rejecting request ${requestId}`);
    
    const request = await RegistrationQueue.rejectRequest(
      requestId,
      adminPubkey,
      reason || 'No reason provided'
    );
    
    res.json({
      success: true,
      request: {
        id: request.id,
        status: request.status,
        rejectionReason: request.rejectionReason
      }
    });
    
  } catch (error) {
    console.error('❌ Rejection error:', error);
    res.status(500).json({ error: 'Rejection failed', message: error.message });
  }
});

/**
 * Get user credentials (after approval)
 * GET /api/credentials/:wallet
 */
app.get('/api/credentials/:wallet', async (req, res) => {
  try {
    const wallet = req.params.wallet;
    const request = await RegistrationQueue.getRequestByWallet(wallet);
    
    if (!request || request.status !== RequestStatus.APPROVED) {
      return res.status(404).json({ 
        error: 'No approved registration found for this wallet' 
      });
    }
    
    // Return encrypted credentials that user can decrypt with their wallet
    // In production, this would use proper asymmetric encryption
    res.json({
      found: true,
      leafIndex: request.leafIndex,
      commitment: request.identityCommitment,
      message: 'Use your wallet to decrypt credentials in the frontend'
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to get credentials' });
  }
});

// ============================================================
// Statistics Endpoints
// ============================================================

/**
 * Get registration statistics
 * GET /api/stats
 */
app.get('/api/stats', async (req, res) => {
  try {
    const treeData = await Storage.loadTree();
    const regStats = await RegistrationQueue.getStats();
    
    res.json({
      registeredCitizens: treeData.leaves?.length || 0,
      registrationRequests: regStats,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

app.listen(PORT, () => {
  console.log(`🌳 Merkle Tree API running on http://localhost:${PORT}`);
  console.log(`📍 Core Endpoints:`);
  console.log(`   GET  /health                         - Server health check`);
  console.log(`   POST /add-leaf                       - Add leaf to tree`);
  console.log(`   GET  /merkle-proof/:commitment       - Get merkle proof`);
  console.log(`   GET  /tree-info                      - Current tree state`);
  console.log(`\n📍 Registration Endpoints (Zassport):`);
  console.log(`   GET  /api/zassport/verify/:wallet    - Check Zassport attestation`);
  console.log(`   POST /api/registration/request       - Submit registration request`);
  console.log(`   GET  /api/registration/status/:wallet - Check request status`);
  console.log(`   GET  /api/credentials/:wallet        - Get credentials after approval`);
  console.log(`\n📍 Admin Endpoints:`);
  console.log(`   GET  /api/admin/pending              - View pending requests`);
  console.log(`   POST /api/admin/approve              - Approve request`);
  console.log(`   POST /api/admin/reject               - Reject request`);
  console.log(`   GET  /api/stats                      - Registration statistics`);
  console.log('\n✅ Ready to serve!\n');
});
