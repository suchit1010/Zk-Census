import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { buildRegisterCitizenTx } from '@/lib/census';
import { generateIdentityCommitment } from '@/lib/zkProof';

export function AdminPanel() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [nfcInput, setNfcInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'registering' | 'success' | 'error'>('idle');
  const [lastRegistered, setLastRegistered] = useState<string | null>(null);

  const handleRegister = useCallback(async () => {
    if (!publicKey || !nfcInput.trim()) return;

    try {
      setStatus('registering');

      // Generate identity commitment from NFC UID + salt
      const { commitment, identityNullifier, identityTrapdoor } = await generateIdentityCommitment(nfcInput);

      // Build and send registration transaction
      const tx = await buildRegisterCitizenTx({
        admin: publicKey,
        identityCommitment: commitment,
        connection,
      });

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      // For demo: Save identity to localStorage
      // In production: Transfer secrets to user's device via QR/NFC
      const identityData = {
        identityNullifier: identityNullifier.toString(),
        identityTrapdoor: identityTrapdoor.toString(),
        leafIndex: 0, // TODO: Get actual leaf index from event logs
        registeredAt: Date.now(),
      };
      localStorage.setItem('zk-census-identity', JSON.stringify(identityData));

      setStatus('success');
      setLastRegistered(commitment.slice(0, 16) + '...');
      setNfcInput('');

      console.log('✅ Identity registered and saved to localStorage');

    } catch (err) {
      console.error('Registration failed:', err);
      setStatus('error');
    }
  }, [publicKey, nfcInput, connection, sendTransaction]);

  return (
    <div className="glass-card p-8 border-2 border-yellow-500/30">
      <h3 className="text-2xl font-semibold mb-4 flex items-center gap-2">
        <span>👮</span> Gatekeeper Panel
        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">ADMIN</span>
      </h3>
      
      <p className="text-gray-400 mb-6">
        Register new citizens by scanning their NFC wristband. This creates their 
        identity commitment in the Merkle tree.
      </p>

      <div className="space-y-4">
        {/* NFC Input */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            NFC Wristband UID
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={nfcInput}
              onChange={(e) => setNfcInput(e.target.value)}
              placeholder="Scan or enter NFC UID..."
              className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-lg 
                         text-white placeholder-gray-500 focus:outline-none focus:border-solarpunk-primary"
            />
            <button
              onClick={() => {
                // In production: Use Web NFC API
                alert('NFC scanning would be enabled on mobile devices');
              }}
              className="px-4 py-3 bg-white/10 rounded-lg hover:bg-white/20 transition"
            >
              📱 Scan
            </button>
          </div>
        </div>

        {/* Register Button */}
        <button
          onClick={handleRegister}
          disabled={!nfcInput.trim() || status === 'registering'}
          className={`
            w-full py-4 px-6 rounded-xl font-semibold text-lg
            transition-all duration-200
            ${!nfcInput.trim() || status === 'registering'
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-yellow-500 hover:bg-yellow-400 text-black'
            }
          `}
        >
          {status === 'registering' ? (
            <>
              <span className="inline-block mr-2 animate-spin">⚙️</span>
              Registering...
            </>
          ) : (
            'Register Citizen'
          )}
        </button>

        {/* Status Messages */}
        {status === 'success' && lastRegistered && (
          <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-300">
            ✓ Citizen registered! Commitment: {lastRegistered}
          </div>
        )}

        {status === 'error' && (
          <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
            Registration failed. Please try again.
          </div>
        )}
      </div>

      {/* Admin Actions */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <h4 className="text-sm font-semibold text-gray-400 mb-3">Admin Actions</h4>
        <div className="flex gap-2">
          <button
            onClick={() => {/* TODO: Implement advance scope */}}
            className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition text-sm"
          >
            📅 Advance Scope
          </button>
          <button
            onClick={() => {/* TODO: Implement export stats */}}
            className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition text-sm"
          >
            📊 Export Stats
          </button>
        </div>
      </div>
    </div>
  );
}
