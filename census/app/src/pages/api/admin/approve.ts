/**
 * API Route: POST /api/admin/approve
 * 
 * Approves a registration request.
 * Generates ZK credentials and prepares for on-chain registration.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistrationStore } from '../../../lib/registrationStore';
import { generateCensusIdentity } from '@/lib/censusIdentity';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requestId, adminPubkey, leafIndex } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'Request ID required' });
    }

    // TODO: In production, verify adminPubkey is in allowed admins list
    // const isAdmin = await verifyAdminSignature(adminPubkey, signature);

    const store = getRegistrationStore();
    const request = store.getRequestById(requestId);

    if (!request) {
      return res.status(404).json({ 
        success: false,
        error: 'Request not found' 
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Request is already ${request.status}`,
      });
    }

    // Check for duplicate nullifier (Sybil check)
    const duplicateCheck = store.checkDuplicateNullifier(
      request.zassportNullifier,
      request.walletPubkey
    );

    if (duplicateCheck.isDuplicate) {
      // Auto-reject if passport already used with different wallet
      store.rejectRequest(
        requestId, 
        `Passport already registered with wallet ${duplicateCheck.existingWallet?.slice(0, 8)}...`
      );
      
      return res.status(400).json({
        success: false,
        error: 'This passport has already been used with a different wallet',
        duplicateWallet: duplicateCheck.existingWallet?.slice(0, 8),
      });
    }

    // Generate ZK census identity from Zassport commitment
    const credentials = await generateCensusIdentity(
      request.zassportCommitment,
      request.walletPubkey
    );

    // Get current leaf count for the new citizen's index
    // In production, this would query the Merkle tree indexer
    const currentLeafCount = leafIndex ?? store.getStats().approved;

    // Approve the request with generated credentials
    const approved = store.approveRequest(requestId, {
      credentials: {
        identityNullifier: credentials.identityNullifier.toString(),
        identityTrapdoor: credentials.identityTrapdoor.toString(),
        identityCommitment: credentials.identityCommitment.toString(),
      },
      leafIndex: currentLeafCount,
    });

    if (!approved) {
      return res.status(500).json({
        success: false,
        error: 'Failed to approve request',
      });
    }

    return res.status(200).json({
      success: true,
      commitment: credentials.identityCommitment.toString(),
      leafIndex: currentLeafCount,
      message: 'Registration approved. Proceed with on-chain registration.',
    });
  } catch (error: any) {
    console.error('Error approving registration:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
}
