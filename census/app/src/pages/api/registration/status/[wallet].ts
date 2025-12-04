/**
 * API Route: GET /api/registration/status/[wallet]
 * 
 * Returns the registration status for a given wallet address.
 * This checks against the in-memory registration queue and Merkle tree.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistrationStore } from '../../../../lib/registrationStore';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { wallet } = req.query;
    
    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    const store = getRegistrationStore();
    const request = store.getRequestByWallet(wallet);

    if (!request) {
      return res.status(200).json({
        found: false,
        request: null,
      });
    }

    return res.status(200).json({
      found: true,
      request: {
        id: request.id,
        status: request.status,
        requestedAt: request.requestedAt,
        processedAt: request.processedAt,
        leafIndex: request.leafIndex,
        rejectionReason: request.rejectionReason,
      },
    });
  } catch (error: any) {
    console.error('Error checking registration status:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
