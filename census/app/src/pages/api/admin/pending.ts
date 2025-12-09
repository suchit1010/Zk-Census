/**
 * API Route: GET /api/admin/pending
 * 
 * Returns all pending registration requests for admin review.
 * Proxies to the indexer service.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const INDEXER_API_URL = process.env.INDEXER_API_URL || process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:4000';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Proxy to indexer service
    const indexerRes = await fetch(`${INDEXER_API_URL}/api/admin/pending`);
    const data = await indexerRes.json();
    
    return res.status(indexerRes.status).json(data);
  } catch (error: any) {
    console.error('Error fetching pending requests:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
    console.error('Error fetching pending requests:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
