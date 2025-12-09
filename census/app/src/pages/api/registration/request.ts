/**
 * API Route: POST /api/registration/request
 * 
 * Submits a new registration request.
 * Proxies to the indexer service which handles admin approval workflow.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const INDEXER_API_URL = process.env.INDEXER_API_URL || process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:4000';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletPubkey } = req.body;

    if (!walletPubkey) {
      return res.status(400).json({ error: 'Wallet public key required' });
    }

    // Proxy to indexer service which handles auto-approval
    const indexerRes = await fetch(`${INDEXER_API_URL}/api/registration/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await indexerRes.json();
    return res.status(indexerRes.status).json(data);
  } catch (error: any) {
    console.error('Error creating registration request:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
}
