import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { buildRegisterCitizenTx } from '@/lib/census';
import { generateIdentity } from '@/lib/zkProof';
import { Transaction } from '@solana/web3.js';

const INDEXER_API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:4000';

interface RegisterButtonProps {
  onRegistered: () => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

type RegisterStatus = 'idle' | 'generating' | 'submitting' | 'success' | 'error';

export function RegisterButton({ onRegistered, onError, disabled }: RegisterButtonProps) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [status, setStatus] = useState<RegisterStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleRegister = useCallback(async () => {
    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      setError(null);
      setStatus('generating');

      console.log('🔐 Generating ZK identity...');
      
      // Step 1: Generate identity commitment
      const { identityNullifier, identityTrapdoor, identityCommitment, identityCommitmentBigInt } = generateIdentity();
      
      // Use the BigInt string directly for storage and indexer
      const commitmentStr = identityCommitmentBigInt.toString();
      
      console.log('✅ Identity generated:', {
        commitment: commitmentStr.slice(0, 20) + '...',
      });

      // Step 2: Build registration transaction
      setStatus('submitting');
      console.log('📤 Building registration transaction...');

      const transaction = await buildRegisterCitizenTx({
        admin: publicKey,
        identityCommitment: identityCommitment,
        connection,
      });

      console.log('✅ Transaction built');

      // Step 3: Sign transaction
      console.log('✍️ Signing transaction...');
      
      if (!signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      
      const signedTransaction = await signTransaction(transaction);
      console.log('✅ Transaction signed');

      // Step 4: Send raw transaction
      console.log('📤 Sending transaction...');
      const rawTransaction = signedTransaction.serialize();
      const signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      
      console.log('✅ Transaction sent:', signature);
      console.log('View on explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);

      // Step 5: Confirm transaction
      console.log('⏳ Confirming transaction...');
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log('✅ Registration confirmed!');

      // Step 6: Parse transaction logs to get leaf index
      const txDetails = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });

      let leafIndex = 0; // Default
      if (txDetails?.meta?.logMessages) {
        const leafLog = txDetails.meta.logMessages.find(log => 
          log.includes('Citizen registered at leaf index')
        );
        if (leafLog) {
          const match = leafLog.match(/leaf index (\d+)/);
          if (match) {
            leafIndex = parseInt(match[1]);
            console.log('✅ Leaf index:', leafIndex);
          }
        }
      }

      // Step 7: Register with indexer API (add leaf to merkle tree)
      // Use commitmentStr that was already defined from identityCommitmentBigInt
      console.log('📤 Registering with indexer...');
      try {
        const indexerResponse = await fetch(`${INDEXER_API_URL}/add-leaf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commitment: commitmentStr }),
        });
        
        if (indexerResponse.ok) {
          const indexerResult = await indexerResponse.json();
          console.log('✅ Registered with indexer:', indexerResult);
          leafIndex = indexerResult.leafIndex;
        } else {
          console.warn('⚠️ Indexer registration failed, but on-chain succeeded');
        }
      } catch (indexerError) {
        console.warn('⚠️ Could not reach indexer:', indexerError);
      }
      
      // Step 8: Store identity in localStorage
      const identityData = {
        identityNullifier: identityNullifier.toString(),
        identityTrapdoor: identityTrapdoor.toString(),
        identityCommitment: commitmentStr,
        leafIndex,
        registeredAt: Date.now(),
        signature,
      };

      localStorage.setItem('zk-census-identity', JSON.stringify(identityData));
      console.log('✅ Identity saved to localStorage');
      console.log('   Commitment:', commitmentStr.slice(0, 20) + '...');

      setStatus('success');
      onRegistered();

    } catch (err: any) {
      console.error('❌ Registration failed:', err);
      
      let errorMsg = 'Registration failed';
      
      // Parse specific errors
      if (err?.message?.includes('User rejected')) {
        errorMsg = 'Transaction was rejected by user';
      } else if (err?.message?.includes('0x1773')) {
        errorMsg = 'Unauthorized - only admin can register citizens';
      } else if (err?.message?.includes('0x1776')) {
        errorMsg = 'Tree is full - maximum capacity reached';
      } else if (err?.message) {
        errorMsg = err.message;
      }
      
      setError(errorMsg);
      setStatus('error');
      if (onError) {
        onError(errorMsg);
      }
    }
  }, [publicKey, connection, signTransaction, onRegistered, onError]);

  const getButtonText = () => {
    switch (status) {
      case 'generating':
        return 'Generating Identity...';
      case 'submitting':
        return 'Submitting...';
      case 'success':
        return '✅ Registered!';
      case 'error':
        return 'Try Again';
      default:
        return '📝 Register as Citizen';
    }
  };

  const isLoading = ['generating', 'submitting'].includes(status);
  const isDisabled = disabled || isLoading || status === 'success' || !publicKey;

  return (
    <div className="space-y-4">
      <button
        onClick={handleRegister}
        disabled={isDisabled}
        className={`
          w-full px-8 py-4 rounded-xl font-semibold text-lg
          transition-all duration-300 transform
          ${isDisabled
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500 hover:scale-105 shadow-lg hover:shadow-xl'
          }
        `}
      >
        {isLoading && (
          <span className="inline-block mr-2 animate-spin">⚙️</span>
        )}
        {getButtonText()}
      </button>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div>
              <p className="text-red-300 font-medium">Error</p>
              <p className="text-red-200 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {status === 'generating' && (
        <div className="p-4 bg-blue-900/30 border border-blue-500/50 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">🔐</span>
            <div>
              <p className="text-blue-300 font-medium">Generating ZK Identity</p>
              <p className="text-blue-200 text-sm mt-1">Creating your anonymous identity commitment...</p>
            </div>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="p-4 bg-green-900/30 border border-green-500/50 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-green-300 font-medium">Successfully Registered!</p>
              <p className="text-green-200 text-sm mt-1">You can now submit census proofs</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
