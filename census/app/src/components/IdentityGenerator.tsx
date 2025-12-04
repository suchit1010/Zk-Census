/**
 * Identity Generator - For Testing/Demo Only
 * 
 * Generates a test identity and saves to localStorage
 * In production, this would be done by admin after NFC scan
 */

import { useState } from 'react';
import { generateIdentityCommitment } from '@/lib/zkProof';

export function IdentityGenerator() {
  const [status, setStatus] = useState<'idle' | 'generating' | 'success'>('idle');
  const [identity, setIdentity] = useState<{
    commitment: string;
    nullifier: string;
    trapdoor: string;
  } | null>(null);

  const handleGenerate = async () => {
    try {
      setStatus('generating');

      // Generate random identity
      const randomNfc = `NFC-${Math.random().toString(36).substring(7)}`;
      const { commitment, identityNullifier, identityTrapdoor } = 
        await generateIdentityCommitment(randomNfc);

      // Save to localStorage
      const identityData = {
        identityNullifier: identityNullifier.toString(),
        identityTrapdoor: identityTrapdoor.toString(),
        leafIndex: 0, // This should come from registration
        registeredAt: Date.now(),
      };
      localStorage.setItem('zk-census-identity', JSON.stringify(identityData));

      setIdentity({
        commitment: Array.from(commitment).map(b => b.toString(16).padStart(2, '0')).join(''),
        nullifier: identityNullifier.toString(),
        trapdoor: identityTrapdoor.toString(),
      });

      setStatus('success');
    } catch (err) {
      console.error('Failed to generate identity:', err);
      setStatus('idle');
    }
  };

  const handleClear = () => {
    localStorage.removeItem('zk-census-identity');
    setIdentity(null);
    setStatus('idle');
  };

  return (
    <div className="glass-card p-6 border border-yellow-500/20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">🔑 Test Identity</h3>
        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
          DEMO ONLY
        </span>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Generate a test identity for demo purposes. In production, citizens receive
        their identity after admin registration.
      </p>

      {!identity ? (
        <button
          onClick={handleGenerate}
          disabled={status === 'generating'}
          className="w-full py-3 px-4 bg-solarpunk-primary hover:bg-solarpunk-accent 
                     text-white font-semibold rounded-lg transition disabled:opacity-50"
        >
          {status === 'generating' ? '⚙️ Generating...' : '✨ Generate Test Identity'}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-xs text-green-400 mb-2">✓ Identity Created</p>
            <div className="space-y-1 text-xs font-mono">
              <div className="truncate">
                <span className="text-gray-400">Commitment:</span>{' '}
                <span className="text-white">{identity.commitment.slice(0, 32)}...</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleClear}
            className="w-full py-2 px-4 bg-red-500/20 hover:bg-red-500/30 
                       text-red-400 font-semibold rounded-lg transition text-sm"
          >
            🗑️ Clear Identity
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-3">
        💡 This simulates receiving identity secrets from the admin after NFC registration.
      </p>
    </div>
  );
}
