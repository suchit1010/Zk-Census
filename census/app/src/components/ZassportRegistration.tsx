import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';
import useZassport from '@/hooks/useZassport';

const INDEXER_API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:4000';
const ZASSPORT_VERIFY_URL = 'https://zassport.vercel.app/verify';

interface ZassportStatus {
  eligible: boolean;
  reason?: string;
  attestation?: {
    pda: string;
    isValid: boolean;
    isAdult: boolean;
    nationality?: string;
    verifiedAt: number;
    expiresAt: number;
  };
}

interface RegistrationStatus {
  found: boolean;
  request?: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: number;
    processedAt?: number;
    hasCredentials?: boolean;
    leafIndex?: number;
    rejectionReason?: string;
  };
}

interface Props {
  onStatusChange?: (status: string) => void;
  onCredentialsReceived?: (credentials: any) => void;
}

export function ZassportRegistration({ onStatusChange, onCredentialsReceived }: Props) {
  const { connected, publicKey } = useWallet();
  
  // Use the Zassport hook for verification state
  const zassport = useZassport();
  
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check registration status
  const checkRegistration = useCallback(async () => {
    if (!publicKey) return;

    try {
      const res = await fetch(`${INDEXER_API_URL}/api/registration/status/${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        setRegistrationStatus(data);
        
        if (data.request?.status) {
          onStatusChange?.(data.request.status);
        }
      }
    } catch (e) {
      console.warn('Could not check registration status');
    }
  }, [publicKey, onStatusChange]);

  // Poll for status updates
  useEffect(() => {
    if (connected && publicKey) {
      checkRegistration();
      
      const interval = setInterval(() => {
        checkRegistration();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [connected, publicKey, checkRegistration]);

  // Build Zassport URL with wallet and callback
  const getZassportUrl = useCallback(() => {
    if (!publicKey) return ZASSPORT_VERIFY_URL;
    
    const callbackUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}/zassport-callback`
      : '';
    
    const params = new URLSearchParams({
      wallet: publicKey.toBase58(),
      callback: callbackUrl,
      app: 'zk-census',
    });
    
    return `${ZASSPORT_VERIFY_URL}?${params.toString()}`;
  }, [publicKey]);

  // Submit registration request
  const handleSubmitRequest = async () => {
    if (!publicKey || !zassport.isEligible) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${INDEXER_API_URL}/api/registration/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey: publicKey.toBase58(),
          zassportPDA: zassport.pda,
          nullifier: zassport.nullifier,
          commitment: zassport.commitment,
        })
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Registration request failed');
      }

      // Check if auto-approved (new feature!)
      if (data.autoApproved && data.registration) {
        console.log('🚀 Auto-approved! Registration complete.');
        console.log(`   Leaf Index: ${data.registration.leafIndex}`);
        console.log(`   TX: ${data.registration.txSignature}`);
        
        // Pass credentials to parent if provided
        if (data.encryptedCredentials) {
          onCredentialsReceived?.({
            ...data.encryptedCredentials,
            leafIndex: data.registration.leafIndex,
            commitment: data.registration.commitment,
            autoApproved: true
          });
        }
      }

      // Refresh status
      await checkRegistration();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Get credentials after approval
  const handleGetCredentials = async () => {
    if (!publicKey) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${INDEXER_API_URL}/api/credentials/${publicKey.toBase58()}`);
      const data = await res.json();

      if (data.found) {
        onCredentialsReceived?.(data);
      }
    } catch (err) {
      console.error('Failed to get credentials');
    } finally {
      setIsLoading(false);
    }
  };

  // Not connected
  if (!connected) {
    return (
      <div className="p-6 bg-gray-700/30 rounded-xl border border-gray-600 text-center">
        <p className="text-gray-400">Connect your wallet to register</p>
      </div>
    );
  }

  // Already registered and approved
  if (registrationStatus?.request?.status === 'approved') {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        className="p-6 bg-green-900/30 rounded-xl border border-green-700"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">✅</span>
          <div>
            <h3 className="font-bold text-green-400">Registration Approved!</h3>
            <p className="text-sm text-gray-400">You are registered in the ZK Census</p>
          </div>
        </div>

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-gray-400">Leaf Index:</span>
            <span className="font-mono text-green-400">#{registrationStatus.request.leafIndex}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Approved At:</span>
            <span className="font-mono">{new Date(registrationStatus.request.processedAt!).toLocaleDateString()}</span>
          </div>
        </div>

        <button
          onClick={handleGetCredentials}
          disabled={isLoading}
          className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
        >
          {isLoading ? '⏳ Loading...' : '🔐 Get Credentials for Proof'}
        </button>
      </motion.div>
    );
  }

  // Pending approval
  if (registrationStatus?.request?.status === 'pending') {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        className="p-6 bg-yellow-900/30 rounded-xl border border-yellow-700"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl animate-pulse">⏳</span>
          <div>
            <h3 className="font-bold text-yellow-400">Registration Pending</h3>
            <p className="text-sm text-gray-400">Waiting for admin approval</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Request ID:</span>
            <span className="font-mono text-xs">{registrationStatus.request.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Submitted:</span>
            <span className="font-mono">{new Date(registrationStatus.request.requestedAt).toLocaleString()}</span>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          An admin will review your Zassport attestation and approve your registration. This usually takes a few minutes.
        </p>
      </motion.div>
    );
  }

  // Rejected
  if (registrationStatus?.request?.status === 'rejected') {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }}
        className="p-6 bg-red-900/30 rounded-xl border border-red-700"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">❌</span>
          <div>
            <h3 className="font-bold text-red-400">Registration Rejected</h3>
            <p className="text-sm text-gray-400">{registrationStatus.request.rejectionReason}</p>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          If you believe this is an error, please contact the census administrators.
        </p>
      </motion.div>
    );
  }

  // New registration flow
  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Step 1: Zassport Verification */}
      <div className={`p-6 rounded-xl border ${zassport.isEligible ? 'bg-green-900/30 border-green-700' : 'bg-gray-700/30 border-gray-600'}`}>
        <div className="flex items-center gap-3 mb-4">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${zassport.isEligible ? 'bg-green-600' : 'bg-blue-600'}`}>1</span>
          <div>
            <h3 className="font-bold">Verify Identity with Zassport</h3>
            <p className="text-sm text-gray-400">Scan your passport to prove you're a real person</p>
          </div>
        </div>

        {zassport.isChecking ? (
          <div className="flex items-center gap-3 text-blue-400">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              ⏳
            </motion.span>
            <span>Checking Zassport status...</span>
          </div>
        ) : zassport.isEligible ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <span>✅</span>
              <span>Zassport identity verified</span>
            </div>
            
            {/* Show Zassport data */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-black/30 p-2 rounded text-center">
                <p className="text-xs text-gray-400">Age 18+</p>
                <p className="text-lg">{zassport.identity?.ageVerified ? '✅' : '❌'}</p>
              </div>
              <div className="bg-black/30 p-2 rounded text-center">
                <p className="text-xs text-gray-400">Sanctions</p>
                <p className="text-lg">{zassport.identity?.sanctionsVerified ? '✅' : '❌'}</p>
              </div>
              <div className="bg-black/30 p-2 rounded text-center">
                <p className="text-xs text-gray-400">Nationality</p>
                <p className="text-lg">{zassport.identity?.nationalityVerified ? '✅' : '🌍'}</p>
              </div>
            </div>
            
            {/* Show PDA & Nullifier for admin reference */}
            {zassport.pda && (
              <div className="mt-3 p-3 bg-black/20 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">PDA:</span>
                  <code className="text-xs font-mono text-emerald-400 truncate max-w-[200px]">
                    {zassport.pda}
                  </code>
                </div>
                {zassport.nullifier && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Nullifier:</span>
                    <code className="text-xs font-mono text-blue-400 truncate max-w-[200px]">
                      {zassport.nullifier.slice(0, 16)}...
                    </code>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {zassport.reason && (
              <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
                <p className="text-sm text-amber-400">⚠️ {zassport.reason}</p>
              </div>
            )}
            
            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
              <h4 className="text-blue-400 font-medium mb-2">🛂 Zassport Verification Required</h4>
              <p className="text-sm text-gray-400 mb-4">
                No Zassport identity found. Please verify your passport at zassport.vercel.app first.
              </p>
              
              <a
                href={getZassportUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
              >
                <span>🛂</span>
                <span>Verify with Zassport →</span>
              </a>
            </div>
            
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-2">
                Already verified? Click below to refresh status.
              </p>
              <button
                onClick={() => zassport.refreshStatus()}
                disabled={zassport.isChecking}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
              >
                🔄 Refresh Verification Status
              </button>
            </div>
            
            <div className="border-t border-gray-700 pt-4">
              <h5 className="text-sm font-medium text-gray-300 mb-2">What is Zassport?</h5>
              <p className="text-xs text-gray-500">
                Zassport is a privacy-preserving passport verification system. Scan your passport 
                using NFC, and Zassport creates a cryptographic proof that you're a real adult human
                —without storing any personal data.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Submit Registration Request */}
      <div className={`p-6 rounded-xl border ${zassport.isEligible ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-800/30 border-gray-700 opacity-50'}`}>
        <div className="flex items-center gap-3 mb-4">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${zassport.isEligible ? 'bg-green-600' : 'bg-gray-600'}`}>2</span>
          <div>
            <h3 className="font-bold">Submit Registration Request</h3>
            <p className="text-sm text-gray-400">Request to join the ZK Census</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmitRequest}
          disabled={!zassport.isEligible || isLoading}
          className={`w-full py-3 rounded-lg font-medium transition-colors ${zassport.isEligible ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
        >
          {isLoading ? '⏳ Submitting...' : '📝 Submit Registration Request'}
        </button>

        <p className="text-xs text-gray-500 mt-3">
          Your Zassport PDA and nullifier will be verified by an admin before approval.
          No personal data will be stored on-chain—only a 32-byte cryptographic commitment.
        </p>
      </div>

      {/* Info */}
      <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
        <h4 className="font-medium text-blue-400 mb-2">🔒 Privacy Guarantee</h4>
        <p className="text-xs text-gray-400">
          Your passport data never leaves your device. Zassport creates a zero-knowledge attestation 
          that proves you're a real adult without revealing any personal information. The census 
          uses ZK proofs so your participation remains completely anonymous—no one can link your 
          identity to your census participation.
        </p>
      </div>
    </motion.div>
  );
}
