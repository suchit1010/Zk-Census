/**
 * API Route: POST /api/admin/reject
 * 
 * Rejects a registration request with a reason.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistrationStore } from '../../../lib/registrationStore';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requestId, adminPubkey, reason } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'Request ID required' });
    }

    // TODO: In production, verify adminPubkey is in allowed admins list

    const store = getRegistrationStore();
    const request = store.getRequestById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found',
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Request is already ${request.status}`,
      });
    }

    // Reject the request
    const rejected = store.rejectRequest(
      requestId, 
      reason || 'Rejected by admin'
    );

    if (!rejected) {
      return res.status(500).json({
        success: false,
        error: 'Failed to reject request',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Registration request rejected',
    });
  } catch (error: any) {
    console.error('Error rejecting registration:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
