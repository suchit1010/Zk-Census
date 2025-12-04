import { useState, useEffect, useCallback } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Connection } from '@solana/web3.js';

const CENSUS_PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const CENSUS_STATE_SEED = Buffer.from('census_state');

export interface CensusState {
  admin: PublicKey;
  currentScope: number;
  currentPopulation: number;
  totalRegistered: number;
  scopeStartTime: number;
  scopeDuration: number;
  isActive: boolean;
  leafCount: number;
  merkleRoot: Uint8Array;
}

// Minimal RPC fetch to avoid Anchor parsing issues
async function fetchCensusStateRaw(connection: Connection): Promise<CensusState | null> {
  try {
    const [censusStatePda] = PublicKey.findProgramAddressSync(
      [CENSUS_STATE_SEED],
      CENSUS_PROGRAM_ID
    );

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => reject(new Error('RPC timeout')), 10000)
    );
    
    const accountInfo = await Promise.race([
      connection.getAccountInfo(censusStatePda),
      timeoutPromise
    ]);
    
    if (!accountInfo) return null;

    // Decode the CensusState account manually
    // Based on Anchor serialization format
    const data = accountInfo.data;

    // Anchor data accounts DON'T have a discriminator - only instructions do!
    // Start from offset 0
    let offset = 0;

    // admin: pubkey (32 bytes)
    const admin = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // merkle_root: [u8; 32]
    const merkleRoot = data.slice(offset, offset + 32);
    offset += 32;

    // merkle_tree: pubkey (32 bytes)
    offset += 32;

    // current_scope: u64
    const currentScope = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // scope_start_time: i64
    const scopeStartTime = Number(data.readBigInt64LE(offset));
    offset += 8;

    // scope_duration: i64
    const scopeDuration = Number(data.readBigInt64LE(offset));
    offset += 8;

    // total_registered: u64
    const totalRegistered = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // current_population: u64
    const currentPopulation = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // leaf_count: u64
    const leafCount = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // is_active: bool
    const isActive = data[offset] !== 0;

    return {
      admin,
      currentScope,
      currentPopulation,
      totalRegistered,
      scopeStartTime,
      scopeDuration,
      isActive,
      leafCount,
      merkleRoot,
    };
  } catch (err: any) {
    // Silently fail for network errors - return null and use defaults
    console.warn('Census state fetch failed (using defaults):', err?.message || err);
    return null;
  }
}

export function useCensusState(pollingInterval: number = 5000) {
  const { connection } = useConnection();
  const [censusState, setCensusState] = useState<CensusState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchCensusState = useCallback(async () => {
    try {
      setError(null);
      const state = await fetchCensusStateRaw(connection);

      if (state) {
        setCensusState(state);
        setLastUpdate(new Date());
      } else {
        setError('Census state not found');
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching census state:', err);
      setError(err.message || 'Failed to fetch census state');
      setLoading(false);
    }
  }, [connection]);

  // Initial fetch
  useEffect(() => {
    fetchCensusState();
  }, [fetchCensusState]);

  // Polling
  useEffect(() => {
    if (pollingInterval <= 0) return;

    const interval = setInterval(() => {
      fetchCensusState();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [fetchCensusState, pollingInterval]);

  return {
    censusState,
    loading,
    error,
    lastUpdate,
    refetch: fetchCensusState,
  };
}
