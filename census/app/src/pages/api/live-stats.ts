import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Default stats when RPC is unavailable
const DEFAULT_STATS = {
  totalRegistered: 604800,
  currentPopulation: 0,
  currentScope: 1,
  participationRate: '0.0',
  isActive: true,
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const connection = new Connection(RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 10000,
    });
    
    // Derive census state PDA
    const [censusStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('census_state')],
      PROGRAM_ID
    );

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => resolve(null), 8000)
    );
    
    const accountInfo = await Promise.race([
      connection.getAccountInfo(censusStatePda),
      timeoutPromise
    ]);
    
    if (!accountInfo) {
      return res.status(200).json(DEFAULT_STATS);
    }

    const data = accountInfo.data;
    
    // Parse CensusState (no discriminator for data accounts)
    // Layout:
    // 0-32: admin (Pubkey)
    // 32-64: merkle_root ([u8; 32])
    // 64-96: merkle_tree (Pubkey)
    // 96-104: current_scope (u64)
    // 104-112: scope_start_time (i64)
    // 112-120: scope_duration (i64)
    // 120-128: total_registered (u64)
    // 128-136: current_population (u64)
    // 136-144: leaf_count (u64)
    // 144: is_active (bool)
    // 145: bump (u8)
    
    const currentScope = Number(data.readBigUInt64LE(96));
    const scopeDuration = Number(data.readBigInt64LE(112));
    const totalRegistered = Number(data.readBigUInt64LE(120));
    const currentPopulation = Number(data.readBigUInt64LE(128));
    const isActive = data[144] === 1;

    const participationRate = totalRegistered > 0 
      ? ((currentPopulation / totalRegistered) * 100).toFixed(1)
      : '0.0';

    res.status(200).json({
      totalRegistered,
      currentPopulation,
      currentScope,
      scopeDuration,
      participationRate,
      isActive,
    });
  } catch (error: any) {
    // Silently return defaults - don't log errors for network issues
    console.warn('Live stats fetch failed, using defaults');
    res.status(200).json(DEFAULT_STATS);
  }
}
