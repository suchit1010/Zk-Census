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
import { createAdminService } from './adminService.js';

const app = express();
const PORT = 4000;

// Solana connection for Zassport verification
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(SOLANA_RPC);
const zassportVerifier = new ZassportVerifier(connection);

// Admin salt for identity derivation (keep this SECRET in production)
const ADMIN_SALT = process.env.ADMIN_SALT || 'census-admin-salt-change-in-production';
const identityGenerator = new IdentityGenerator(ADMIN_SALT);

// Admin service for auto-approval (loads admin keypair)
let adminService = null;

app.use(cors());
app.use(express.json());

// Initialize storage and admin service on startup
async function initializeStorage() {
  await Storage.initialize();
  await RegistrationQueue.initialize();
  console.log('📦 Storage initialized');
  
  // Initialize admin service for auto-approval
  adminService = await createAdminService(connection);
  if (adminService.isReady()) {
    console.log('🔑 Admin service ready for auto-approval');
  } else {
    console.log('⚠️ Admin service not ready - manual approval required');
    console.log('   To enable auto-approval, copy admin keypair to ./data/admin-keypair.json');
  }
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

// Get all registered citizens
app.get('/api/citizens', async (req, res) => {
  try {
    const citizens = await Storage.loadCitizens();
    const treeData = await Storage.loadTree();
    
    res.json({
      citizens: citizens.map((c, i) => ({
        commitment: c.commitment,
        leafIndex: c.leafIndex ?? i,
        registeredAt: c.registeredAt,
      })),
      total: citizens.length,
      treeLeafCount: treeData.leaves?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching citizens:', error);
    res.status(500).json({ error: 'Failed to load citizens', citizens: [] });
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
 * 
 * If admin service is ready, this will AUTO-APPROVE valid Zassport holders
 */
app.post('/api/registration/request', async (req, res) => {
  try {
    const { walletPubkey } = req.body;
    
    if (!walletPubkey) {
      return res.status(400).json({ error: 'Missing walletPubkey' });
    }
    
    console.log(`📝 New registration request from: ${walletPubkey.slice(0, 8)}...`);
    
    // Check if already registered on-chain
    if (adminService?.isReady()) {
      const alreadyRegistered = await adminService.isWalletRegistered(walletPubkey);
      if (alreadyRegistered) {
        // Try to find their credentials
        const existingRequest = await RegistrationQueue.getRequestByWallet(walletPubkey);
        console.log(`⚠️ Wallet ${walletPubkey.slice(0, 8)}... is already registered`);
        return res.status(200).json({
          success: true,
          alreadyRegistered: true,
          request: existingRequest ? {
            id: existingRequest.id,
            status: existingRequest.status,
            walletPubkey: existingRequest.walletPubkey,
            requestedAt: existingRequest.requestedAt,
            leafIndex: existingRequest.leafIndex,
          } : null,
          message: 'This wallet is already registered in the census. Use your existing credentials.'
        });
      }
    }
    
    // Verify Zassport attestation
    const zassportResult = await zassportVerifier.verifyAttestation(walletPubkey);
    
    if (!zassportResult.eligible) {
      return res.status(400).json({
        success: false,
        error: 'Not eligible for registration',
        reason: zassportResult.reason
      });
    }
    
    console.log(`✅ Zassport verified for ${walletPubkey.slice(0, 8)}...`);
    
    // ============================================================
    // AUTO-APPROVAL: If admin service is ready, approve immediately
    // ============================================================
    if (adminService?.isReady()) {
      console.log(`🚀 Auto-approval enabled - processing immediately...`);
      
      try {
        // Generate identity
        const identity = await identityGenerator.generateIdentity(
          walletPubkey,
          zassportResult.attestation?.passportHash || 'zassport-verified'
        );
        
        // Register on-chain using admin keypair
        const onChainResult = await adminService.registerCitizenOnChain(
          walletPubkey,
          identity.commitment,
          identity.identityNullifier  // Fixed: was nullifierHash
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
          walletPubkey,
          registeredAt: new Date().toISOString(),
          txSignature: onChainResult.signature
        });
        
        // Create approved request record WITH credentials
        const request = {
          id: RegistrationQueue.generateRequestId(),
          walletPubkey,
          zassportPDA: zassportResult.attestation?.pda,
          zassportData: zassportResult.attestation,
          requestedAt: Date.now(),
          status: RequestStatus.APPROVED,
          processedAt: Date.now(),
          processedBy: adminService.getAdminPubkey(),
          identityCommitment: identity.commitment,
          leafIndex,
          // Store credentials for later retrieval
          credentials: {
            identityNullifier: identity.identityNullifier,
            identityTrapdoor: identity.identityTrapdoor,
            commitment: identity.commitment,
          }
        };
        
        // Save to registration queue for tracking
        const requests = await RegistrationQueue.loadRequests();
        requests.push(request);
        await RegistrationQueue.saveRequests(requests);
        
        // Encrypt credentials for delivery
        const encryptedCredentials = identityGenerator.encryptCredentials(
          {
            identityNullifier: identity.identityNullifier,
            identityTrapdoor: identity.identityTrapdoor,
            commitment: identity.commitment,
            leafIndex
          },
          walletPubkey
        );
        
        console.log(`✅ Auto-approved! Leaf index: ${leafIndex}`);
        
        return res.json({
          success: true,
          autoApproved: true,
          request: {
            id: request.id,
            status: RequestStatus.APPROVED,
            walletPubkey: request.walletPubkey,
            requestedAt: request.requestedAt
          },
          registration: {
            leafIndex,
            commitment: identity.commitment,
            merkleRoot: tree.getRoot(),
            txSignature: onChainResult.signature,
            citizenPDA: onChainResult.citizenPDA
          },
          encryptedCredentials,
          message: 'Registration auto-approved! Your ZK credentials are ready.'
        });
        
      } catch (autoApproveError) {
        console.error(`❌ Auto-approval failed: ${autoApproveError.message}`);
        console.log(`   Falling back to manual approval queue...`);
        // Fall through to manual approval queue
      }
    }
    
    // ============================================================
    // MANUAL APPROVAL: Queue for admin review
    // ============================================================
    console.log(`📋 Queuing for manual approval...`);
    
    // Create registration request
    const request = await RegistrationQueue.createRequest(
      walletPubkey,
      zassportResult.attestation?.pda,
      zassportResult.attestation
    );
    
    console.log(`✅ Request created: ${request.id}`);
    
    res.json({
      success: true,
      autoApproved: false,
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
    
    // Handle "already registered" case - return existing registration info
    if (error.message === 'Wallet is already registered' && error.existingRequest) {
      return res.status(200).json({
        success: true,
        alreadyRegistered: true,
        request: {
          id: error.existingRequest.id,
          status: error.existingRequest.status,
          walletPubkey: error.existingRequest.walletPubkey,
          requestedAt: error.existingRequest.requestedAt,
          leafIndex: error.existingRequest.leafIndex,
        },
        message: 'Wallet is already registered. Use your existing credentials.'
      });
    }
    
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
      stats,
      autoApprovalEnabled: adminService?.isReady() || false
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get pending requests' });
  }
});

/**
 * Auto-process all pending requests (if admin service is ready)
 * POST /api/admin/auto-process
 * This will auto-approve all valid pending requests using the server's admin keypair
 */
app.post('/api/admin/auto-process', async (req, res) => {
  try {
    if (!adminService?.isReady()) {
      return res.status(503).json({ 
        error: 'Admin service not ready',
        message: 'Auto-approval is not available. Admin keypair not loaded.'
      });
    }

    const pending = await RegistrationQueue.getPendingRequests();
    console.log(`🔄 Auto-processing ${pending.length} pending requests...`);

    const results = [];
    
    for (const request of pending) {
      try {
        console.log(`  Processing ${request.id} for ${request.walletPubkey.slice(0, 8)}...`);
        
        // Generate identity
        const identity = await identityGenerator.generateIdentity(
          request.walletPubkey,
          request.zassportData?.passportHash || 'zassport-verified'
        );
        
        // Register on-chain using admin keypair
        const onChainResult = await adminService.registerCitizenOnChain(
          request.walletPubkey,
          identity.commitment,
          identity.nullifierHash
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
          txSignature: onChainResult.signature
        });
        
        // Update request status with credentials
        await RegistrationQueue.approveRequest(
          request.id,
          adminService.getAdminPubkey(),
          identity.commitment,
          leafIndex,
          {
            identityNullifier: identity.identityNullifier,
            identityTrapdoor: identity.identityTrapdoor,
            commitment: identity.commitment,
          }
        );
        
        results.push({
          requestId: request.id,
          wallet: request.walletPubkey,
          success: true,
          leafIndex,
          txSignature: onChainResult.signature
        });
        
        console.log(`  ✅ Approved: ${request.id}`);
        
      } catch (err) {
        console.error(`  ❌ Failed: ${request.id} - ${err.message}`);
        results.push({
          requestId: request.id,
          wallet: request.walletPubkey,
          success: false,
          error: err.message
        });
      }
    }
    
    res.json({
      success: true,
      processed: results.length,
      results
    });
    
  } catch (error) {
    console.error('❌ Auto-process error:', error);
    res.status(500).json({ error: 'Auto-process failed', message: error.message });
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
    
    // Update request status with credentials
    await RegistrationQueue.approveRequest(
      requestId, 
      adminPubkey, 
      identity.commitment,
      leafIndex,
      {
        identityNullifier: identity.identityNullifier,
        identityTrapdoor: identity.identityTrapdoor,
        commitment: identity.commitment,
      }
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
    
    if (!request) {
      return res.status(404).json({ 
        found: false,
        error: 'No registration found for this wallet' 
      });
    }
    
    if (request.status !== RequestStatus.APPROVED) {
      return res.status(400).json({ 
        found: true,
        status: request.status,
        error: request.status === 'pending' 
          ? 'Registration is still pending approval'
          : 'Registration was rejected'
      });
    }
    
    // Return credentials for the user
    res.json({
      found: true,
      status: 'approved',
      credentials: {
        identityNullifier: request.credentials?.identityNullifier || request.identityNullifier,
        identityTrapdoor: request.credentials?.identityTrapdoor || request.identityTrapdoor,
        identityCommitment: request.credentials?.commitment || request.identityCommitment,
        leafIndex: request.leafIndex,
        registeredAt: request.processedAt,
      }
    });
    
  } catch (error) {
    console.error('Error getting credentials:', error);
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
