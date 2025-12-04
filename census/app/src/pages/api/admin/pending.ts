/**
 * API Route: GET /api/admin/pending
 * 
 * Returns all pending registration requests for admin review.
 * Also includes approved requests and statistics.
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
    const store = getRegistrationStore();
    const stats = store.getStats();
    const pending = store.getPendingRequests();
    const approved = store.getApprovedRequests();
    const rejected = store.getRejectedRequests();

    // Format requests for admin view
    const formatRequest = (req: any) => ({
      id: req.id,
      walletPubkey: req.walletPubkey,
      zassportPDA: req.zassportPDA,
      zassportData: {
        isValid: true,
        isAdult: req.zassportData?.ageVerified || false,
        nationality: req.zassportData?.nationality ? 
          String(req.zassportData.nationality) : undefined,
        verifiedAt: req.requestedAt,
        expiresAt: req.requestedAt + (365 * 24 * 60 * 60 * 1000), // 1 year
        passportHash: req.zassportNullifier?.slice(0, 16),
      },
      requestedAt: req.requestedAt,
      processedAt: req.processedAt,
      status: req.status,
      rejectionReason: req.rejectionReason,
    });

    return res.status(200).json({
      pending: pending.map(formatRequest),
      approved: approved.map(formatRequest),
      rejected: rejected.map(formatRequest),
      stats: {
        total: stats.total,
        pending: stats.pending,
        approved: stats.approved,
        rejected: stats.rejected,
      },
    });
  } catch (error: any) {
    console.error('Error fetching pending requests:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
