import type { NextApiRequest, NextApiResponse } from 'next';

const INDEXER_API_URL = process.env.INDEXER_API_URL || 'unset';
const VERIFIER_API_URL = process.env.VERIFIER_API_URL || 'unset';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ping both backends' /health endpoints
  let indexerHealth = null;
  let verifierHealth = null;
  try {
    const resp = await fetch(`${INDEXER_API_URL}/health`);
    indexerHealth = await resp.json();
  } catch (e: any) {
    indexerHealth = { error: e.message };
  }
  try {
    const resp = await fetch(`${VERIFIER_API_URL}/health`);
    verifierHealth = await resp.json();
  } catch (e: any) {
    verifierHealth = { error: e.message };
  }
  res.status(200).json({
    INDEXER_API_URL,
    VERIFIER_API_URL,
    indexerHealth,
    verifierHealth,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    }
  });
}
