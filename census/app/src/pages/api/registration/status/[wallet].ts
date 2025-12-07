/**
 * API Route: GET /api/registration/status/[wallet]
 * 
 * Returns the registration status for a given wallet address.
 * Proxies to the indexer service which manages the actual registration data.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const INDEXER_API_URL = process.env.INDEXER_API_URL || 'http://localhost:4000';

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

    // Proxy to indexer service
    const indexerRes = await fetch(`${INDEXER_API_URL}/api/registration/status/${wallet}`);
    const data = await indexerRes.json();
    
    return res.status(indexerRes.status).json(data);
  } catch (error: any) {
    console.error('Error checking registration status:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
