/**
 * API Route: POST /api/registration/request
 * 
 * Submits a new registration request for admin approval.
 * Stores Zassport attestation data for verification.
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
    const {
      walletPubkey,
      zassportCommitment,
      zassportNullifier,
      ageVerified,
      nationalityVerified,
      nationality,
    } = req.body;

    if (!walletPubkey) {
      return res.status(400).json({ error: 'Wallet public key required' });
    }

    const store = getRegistrationStore();

    // Check if wallet already has a pending or approved request
    const existing = store.getRequestByWallet(walletPubkey);
    if (existing) {
      if (existing.status === 'pending') {
        return res.status(400).json({
          success: false,
          error: 'You already have a pending registration request',
        });
      }
      if (existing.status === 'approved') {
        return res.status(400).json({
          success: false,
          error: 'You are already registered',
        });
      }
      // If rejected, allow resubmission by updating the existing request
    }

    // Check if this Zassport nullifier has been used with another wallet
    if (zassportNullifier) {
      const existingByNullifier = store.getRequestByNullifier(
        Array.isArray(zassportNullifier) 
          ? Buffer.from(zassportNullifier).toString('hex')
          : zassportNullifier
      );
      
      if (existingByNullifier && existingByNullifier.walletPubkey !== walletPubkey) {
        return res.status(400).json({
          success: false,
          error: 'This passport has already been used with a different wallet',
        });
      }
    }

    // Create or update the request
    const request = store.createRequest({
      walletPubkey,
      zassportCommitment: Array.isArray(zassportCommitment) 
        ? Buffer.from(zassportCommitment).toString('hex')
        : zassportCommitment,
      zassportNullifier: Array.isArray(zassportNullifier)
        ? Buffer.from(zassportNullifier).toString('hex')
        : zassportNullifier,
      zassportData: {
        ageVerified: ageVerified || false,
        nationalityVerified: nationalityVerified || false,
        nationality: nationality || 0,
      },
    });

    return res.status(200).json({
      success: true,
      requestId: request.id,
      message: 'Registration request submitted successfully',
    });
  } catch (error: any) {
    console.error('Error creating registration request:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
}
