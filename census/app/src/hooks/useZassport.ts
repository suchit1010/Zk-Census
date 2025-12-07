/**
 * useZassport Hook
 * 
 * Manages Zassport verification state and integration with ZK Census.
 * Handles checking PDA status, redirect flow, and callback processing.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { 
  verifyZassportIdentity, 
  type ZassportIdentity,
  type ZassportVerificationResult,
  ZASSPORT_PROGRAM_ID
} from '@/lib/zassport';

// Zassport verification URL
const ZASSPORT_VERIFY_URL = 'https://zassport.vercel.app/verify';

export interface ZassportState {
  // Loading states
  isChecking: boolean;
  isLoading: boolean;
  
  // Verification result
  hasIdentity: boolean;
  isEligible: boolean;
  identity: ZassportIdentity | null;
  
  // PDA data from Zassport
  pda: string | null;
  nullifier: string | null;
  commitment: string | null;
  
  // Status
  reason: string;
  error: string | null;
  
  // Timestamps
  verifiedAt: number | null;
  expiresAt: number | null;
}

export interface UseZassportReturn extends ZassportState {
  // Actions
  checkZassport: () => Promise<void>;
  redirectToZassport: () => void;
  refreshStatus: () => Promise<void>;
  
  // Helpers
  getVerifyUrl: () => string;
  isExpired: () => boolean;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get the current origin for callback URL
 */
function getCallbackUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/zassport-callback`;
}

export function useZassport(): UseZassportReturn {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  
  // State
  const [state, setState] = useState<ZassportState>({
    isChecking: false,
    isLoading: false,
    hasIdentity: false,
    isEligible: false,
    identity: null,
    pda: null,
    nullifier: null,
    commitment: null,
    reason: '',
    error: null,
    verifiedAt: null,
    expiresAt: null,
  });
  
  // Refs to prevent duplicate checks
  const lastCheckedWallet = useRef<string | null>(null);
  const checkInProgress = useRef(false);
  
  /**
   * Check Zassport verification status for connected wallet
   */
  const checkZassport = useCallback(async () => {
    if (!publicKey || !connection) {
      setState(prev => ({
        ...prev,
        hasIdentity: false,
        isEligible: false,
        reason: 'Wallet not connected',
      }));
      return;
    }
    
    const walletKey = publicKey.toBase58();
    
    // Prevent duplicate simultaneous checks
    if (checkInProgress.current) {
      return;
    }
    
    checkInProgress.current = true;
    setState(prev => ({ ...prev, isChecking: true, error: null }));
    
    try {
      const result = await verifyZassportIdentity(connection, publicKey);
      
      if (result.hasIdentity && result.identity) {
        // Derive PDA address for reference
        const [pdaAddress] = PublicKey.findProgramAddressSync(
          [Buffer.from('identity'), publicKey.toBuffer()],
          ZASSPORT_PROGRAM_ID
        );
        
        setState({
          isChecking: false,
          isLoading: false,
          hasIdentity: true,
          isEligible: result.isEligible,
          identity: result.identity,
          pda: pdaAddress.toBase58(),
          nullifier: result.nullifier || bytesToHex(result.identity.nullifier),
          commitment: result.commitment || bytesToHex(result.identity.commitment),
          reason: result.reason || '',
          error: null,
          verifiedAt: result.identity.verifiedAt,
          expiresAt: result.identity.expiresAt,
        });
        
        lastCheckedWallet.current = walletKey;
      } else {
        setState({
          isChecking: false,
          isLoading: false,
          hasIdentity: false,
          isEligible: false,
          identity: null,
          pda: null,
          nullifier: null,
          commitment: null,
          reason: result.reason || 'No Zassport identity found',
          error: null,
          verifiedAt: null,
          expiresAt: null,
        });
      }
    } catch (error: any) {
      console.error('Zassport check failed:', error);
      setState(prev => ({
        ...prev,
        isChecking: false,
        hasIdentity: false,
        isEligible: false,
        error: error.message || 'Failed to verify Zassport identity',
        reason: error.message?.includes('429') 
          ? 'RPC rate limit reached. Please try again.'
          : 'Verification failed',
      }));
    } finally {
      checkInProgress.current = false;
    }
  }, [publicKey, connection]);
  
  /**
   * Get the Zassport verification URL with wallet and callback
   */
  const getVerifyUrl = useCallback((): string => {
    if (!publicKey) return ZASSPORT_VERIFY_URL;
    
    const params = new URLSearchParams({
      wallet: publicKey.toBase58(),
      callback: getCallbackUrl(),
      app: 'zk-census',
    });
    
    return `${ZASSPORT_VERIFY_URL}?${params.toString()}`;
  }, [publicKey]);
  
  /**
   * Redirect user to Zassport for verification
   */
  const redirectToZassport = useCallback(() => {
    const url = getVerifyUrl();
    // Open in new tab so user can complete verification and return
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [getVerifyUrl]);
  
  /**
   * Refresh status (manual refresh button)
   */
  const refreshStatus = useCallback(async () => {
    lastCheckedWallet.current = null; // Force recheck
    await checkZassport();
  }, [checkZassport]);
  
  /**
   * Check if the identity has expired
   */
  const isExpired = useCallback((): boolean => {
    if (!state.expiresAt) return false;
    return Date.now() > state.expiresAt * 1000;
  }, [state.expiresAt]);
  
  // Auto-check when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      const walletKey = publicKey.toBase58();
      if (lastCheckedWallet.current !== walletKey) {
        checkZassport();
      }
    } else {
      // Reset state when wallet disconnects
      setState({
        isChecking: false,
        isLoading: false,
        hasIdentity: false,
        isEligible: false,
        identity: null,
        pda: null,
        nullifier: null,
        commitment: null,
        reason: '',
        error: null,
        verifiedAt: null,
        expiresAt: null,
      });
      lastCheckedWallet.current = null;
    }
  }, [connected, publicKey]);
  
  // Listen for callback from Zassport (via postMessage or URL params)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from Zassport domain
      if (!event.origin.includes('zassport.vercel.app')) return;
      
      if (event.data?.type === 'ZASSPORT_VERIFIED') {
        // Re-check status after verification
        lastCheckedWallet.current = null;
        checkZassport();
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [checkZassport]);
  
  return {
    ...state,
    checkZassport,
    redirectToZassport,
    refreshStatus,
    getVerifyUrl,
    isExpired,
  };
}

export default useZassport;
