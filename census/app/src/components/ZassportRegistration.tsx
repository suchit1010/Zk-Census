import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';

const INDEXER_API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:4000';
const ZASSPORT_URL = 'https://zassport.vercel.app';

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
  
  const [zassportStatus, setZassportStatus] = useState<ZassportStatus | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check Zassport attestation
  const checkZassport = useCallback(async () => {
    if (!publicKey) return;

    try {
      const res = await fetch(`${INDEXER_API_URL}/api/zassport/verify/${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        setZassportStatus(data);
      }
    } catch (e) {
      console.warn('Could not verify Zassport');
    }
  }, [publicKey]);

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
      checkZassport();
      checkRegistration();
      
      const interval = setInterval(() => {
        checkZassport();
        checkRegistration();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [connected, publicKey, checkZassport, checkRegistration]);

  // Submit registration request
  const handleSubmitRequest = async () => {
    if (!publicKey || !zassportStatus?.eligible) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${INDEXER_API_URL}/api/registration/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey: publicKey.toBase58()
        })
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Registration request failed');
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
      <div className={`p-6 rounded-xl border ${zassportStatus?.eligible ? 'bg-green-900/30 border-green-700' : 'bg-gray-700/30 border-gray-600'}`}>
        <div className="flex items-center gap-3 mb-4">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${zassportStatus?.eligible ? 'bg-green-600' : 'bg-blue-600'}`}>1</span>
          <div>
            <h3 className="font-bold">Verify Identity with Zassport</h3>
            <p className="text-sm text-gray-400">Scan your passport to prove you're a real person</p>
          </div>
        </div>

        {zassportStatus?.eligible ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-400">
              <span>✅</span>
              <span>Zassport attestation verified</span>
            </div>
            {zassportStatus.attestation && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-black/30 p-2 rounded text-center">
                  <p className="text-xs text-gray-400">Valid</p>
                  <p className="text-lg">{zassportStatus.attestation.isValid ? '✅' : '❌'}</p>
                </div>
                <div className="bg-black/30 p-2 rounded text-center">
                  <p className="text-xs text-gray-400">18+</p>
                  <p className="text-lg">{zassportStatus.attestation.isAdult ? '✅' : '❌'}</p>
                </div>
                <div className="bg-black/30 p-2 rounded text-center">
                  <p className="text-xs text-gray-400">Nationality</p>
                  <p className="text-lg">{zassportStatus.attestation.nationality || '🌍'}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {zassportStatus?.reason && (
              <p className="text-sm text-red-400">⚠️ {zassportStatus.reason}</p>
            )}
            <a
              href={`${ZASSPORT_URL}?wallet=${publicKey?.toBase58()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-center rounded-lg font-medium transition-colors"
            >
              🛂 Verify with Zassport
            </a>
            <p className="text-xs text-gray-500 text-center">
              Opens in new tab. Scan your passport using NFC to create an attestation.
            </p>
          </div>
        )}
      </div>

      {/* Step 2: Submit Registration Request */}
      <div className={`p-6 rounded-xl border ${zassportStatus?.eligible ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-800/30 border-gray-700 opacity-50'}`}>
        <div className="flex items-center gap-3 mb-4">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${zassportStatus?.eligible ? 'bg-green-600' : 'bg-gray-600'}`}>2</span>
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
          disabled={!zassportStatus?.eligible || isLoading}
          className={`w-full py-3 rounded-lg font-medium transition-colors ${zassportStatus?.eligible ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
        >
          {isLoading ? '⏳ Submitting...' : '📝 Submit Registration Request'}
        </button>

        <p className="text-xs text-gray-500 mt-3">
          Your Zassport attestation will be verified by an admin before approval.
          No personal data will be stored on-chain.
        </p>
      </div>

      {/* Info */}
      <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
        <h4 className="font-medium text-blue-400 mb-2">🔒 Privacy Notice</h4>
        <p className="text-xs text-gray-400">
          Your passport data never leaves your device. The Zassport attestation only proves you're a real adult 
          without revealing any personal information. The census uses zero-knowledge proofs so your participation 
          remains completely anonymous.
        </p>
      </div>
    </motion.div>
  );
}
