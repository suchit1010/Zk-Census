/**
 * API Route: POST /api/admin/approve
 * 
 * Approves a registration request.
 * Proxies to the indexer service which handles on-chain registration.
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
    const { requestId, adminPubkey } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'Request ID required' });
    }

    // Proxy to indexer service
    const indexerRes = await fetch(`${INDEXER_API_URL}/api/admin/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, adminPubkey }),
    });

    const data = await indexerRes.json();
    return res.status(indexerRes.status).json(data);
  } catch (error: any) {
    console.error('Error approving registration:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
}
