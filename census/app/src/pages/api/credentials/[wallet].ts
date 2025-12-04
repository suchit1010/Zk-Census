/**
 * API Route: GET /api/credentials/[wallet]
 * 
 * Returns ZK census credentials for an approved wallet.
 * These credentials are generated during the admin approval process.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistrationStore } from '../../../lib/registrationStore';

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
      return res.status(404).json({
        found: false,
        error: 'No registration found for this wallet',
      });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({
        found: true,
        status: request.status,
        error: request.status === 'pending' 
          ? 'Registration is still pending approval'
          : 'Registration was rejected',
      });
    }

    if (!request.credentials) {
      return res.status(400).json({
        found: true,
        status: 'approved',
        error: 'Credentials not yet generated. Please wait for the admin to complete the on-chain registration.',
      });
    }

    return res.status(200).json({
      found: true,
      status: 'approved',
      credentials: {
        identityNullifier: request.credentials.identityNullifier,
        identityTrapdoor: request.credentials.identityTrapdoor,
        identityCommitment: request.credentials.identityCommitment,
        leafIndex: request.leafIndex,
        registeredAt: request.processedAt,
        zassportCommitment: request.zassportCommitment,
      },
    });
  } catch (error: any) {
    console.error('Error fetching credentials:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
