import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
  Transaction, 
  TransactionInstruction, 
  SystemProgram, 
  PublicKey,
} from '@solana/web3.js';
import { generateProof } from '@/lib/zkProof';
import { fetchCensusState, deriveCensusStatePda, deriveNullifierPda } from '@/lib/census';

const CENSUS_PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const VERIFIER_API_URL = process.env.NEXT_PUBLIC_VERIFIER_API_URL || 'http://localhost:3001';
const INDEXER_API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:4000';

interface ProveButtonProps {
  onProofSubmitted: () => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

type ProofStatus = 'idle' | 'loading-identity' | 'generating-proof' | 'verifying-offchain' | 'submitting' | 'success' | 'error';

export function ProveButton({ onProofSubmitted, onError, disabled }: ProveButtonProps) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [status, setStatus] = useState<ProofStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleProve = useCallback(async () => {
    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      setError(null);
      setStatus('loading-identity');

      // Step 1: Load identity from localStorage
      const identityData = localStorage.getItem('zk-census-identity');
      if (!identityData) {
        throw new Error('No identity found. Please register first.');
      }
      
      const parsed = JSON.parse(identityData);
      const { identityNullifier, identityTrapdoor, identityCommitment } = parsed;
      
      // Validate that we have all required fields
      if (!identityNullifier || !identityTrapdoor || !identityCommitment) {
        console.error('Invalid identity data:', parsed);
        localStorage.removeItem('zk-census-identity'); // Clear invalid data
        throw new Error('Invalid identity data. Please register again.');
      }
      
      // Handle both string and object formats for commitment
      const commitmentStr = typeof identityCommitment === 'string' 
        ? identityCommitment 
        : String(identityCommitment);
      
      if (commitmentStr === 'undefined' || commitmentStr === 'null' || !commitmentStr) {
        localStorage.removeItem('zk-census-identity'); // Clear invalid data
        throw new Error('Invalid identity commitment. Please register again.');
      }
      
      console.log('✅ Identity loaded:', {
        commitment: commitmentStr.slice(0, 20) + '...',
        nullifier: identityNullifier.toString().slice(0, 10) + '...',
      });

      // Step 2: Fetch census state and Merkle proof from API
      setStatus('generating-proof');
      
      let currentScope = BigInt(1); // Default scope
      try {
        const censusState = await fetchCensusState(connection);
        if (censusState && censusState.currentScope !== undefined) {
          currentScope = censusState.currentScope;
          console.log('✅ Census state fetched:', {
            currentScope: currentScope.toString(),
          });
        } else {
          console.log('⚠️ Census state not found, using default scope');
        }
      } catch (e) {
        console.log('⚠️ Could not fetch census state, using default scope:', e);
      }
      
      // Fetch merkle proof from indexer API
      const proofResponse = await fetch(`${INDEXER_API_URL}/merkle-proof/${commitmentStr}`);
      if (!proofResponse.ok) {
        const errText = await proofResponse.text();
        throw new Error(`Failed to fetch merkle proof: ${errText}. Make sure you are registered.`);
      }
      const merkleProof = await proofResponse.json();
      console.log('✅ Merkle proof fetched:', { leafIndex: merkleProof.leafIndex });

      // Step 3: Generate ZK proof
      console.log('🔐 Generating ZK proof...');
      const proofStartTime = performance.now();
      
      const { proof, publicSignals } = await generateProof({
        identityNullifier: BigInt(identityNullifier),
        identityTrapdoor: BigInt(identityTrapdoor),
        treePathIndices: merkleProof.pathIndices,
        treeSiblings: merkleProof.pathElements.map((s: string) => BigInt(s)),
        signalHash: BigInt(1), // "I'm alive"
        externalNullifier: currentScope,
      });
      
      const proofTime = ((performance.now() - proofStartTime) / 1000).toFixed(2);
      console.log(`✅ Proof generated in ${proofTime}s`);

      // Step 4: Send to verifier API for REAL off-chain verification
      setStatus('verifying-offchain');
      console.log('🔍 Sending proof to verifier for off-chain verification...');
      
      const verifyResponse = await fetch(`${VERIFIER_API_URL}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, publicSignals }),
      });
      
      const verifyResult = await verifyResponse.json();
      
      if (!verifyResult.success) {
        throw new Error(verifyResult.error || 'Proof verification failed');
      }
      
      console.log('✅ Proof verified off-chain!', {
        verificationTime: verifyResult.verificationTimeMs + 'ms',
        verifier: verifyResult.attestation.verifierPubkey,
      });

      // Step 5: Build on-chain transaction with attestation
      setStatus('submitting');
      console.log('📤 Building on-chain transaction...');
      
      const [censusStatePda] = deriveCensusStatePda();
      const nullifierHashBytes = new Uint8Array(verifyResult.attestation.nullifierHashBytes);
      const [nullifierPda] = deriveNullifierPda(nullifierHashBytes);

      // For attestation-based submission, we use submit_attestation instruction
      // But since verifier needs to sign, we'll use the simpler approach:
      // Just submit the proof with the on-chain verification (which is mocked)
      // In production, the verifier server would co-sign the transaction
      
      // Build instruction for submit_census (existing on-chain verification)
      const discriminator = Buffer.from([222, 160, 8, 83, 160, 212, 141, 48]);
      
      // Convert proof to Solana format
      const proofA = hexToBytes64(proof.pi_a);
      const proofB = hexToBytes128(proof.pi_b);
      const proofC = hexToBytes64(proof.pi_c);
      
      const publicInputs = publicSignals.map((s: string) => {
        const bytes = new Uint8Array(32);
        let value = BigInt(s);
        for (let i = 0; i < 32; i++) {
          bytes[i] = Number(value & 0xFFn);
          value >>= 8n;
        }
        return bytes;
      });

      const instructionData = Buffer.concat([
        discriminator,
        Buffer.from(proofA),
        Buffer.from(proofB),
        Buffer.from(proofC),
        ...publicInputs.map((p: Uint8Array) => Buffer.from(p)),
      ]);

      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: censusStatePda, isSigner: false, isWritable: true },
          { pubkey: nullifierPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: CENSUS_PROGRAM_ID,
        data: instructionData,
      });

      // Get fresh blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: publicKey,
      }).add(instruction);

      console.log('✅ Transaction built');

      // Step 6: Sign and send transaction
      if (!signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      
      const signedTransaction = await signTransaction(transaction);
      console.log('✅ Transaction signed');

      const rawTransaction = signedTransaction.serialize();
      const signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      
      console.log('✅ Transaction sent:', signature);
      console.log('View on explorer:', `https://explorer.solana.com/tx/${signature}?cluster=devnet`);

      // Confirm
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log('✅ Transaction confirmed!');
      setStatus('success');
      onProofSubmitted();

    } catch (err: any) {
      console.error('❌ Proof submission failed:', err);
      
      let errorMsg = 'Proof submission failed';
      
      if (err?.message?.includes('User rejected')) {
        errorMsg = 'Transaction was rejected by user';
      } else if (err?.message?.includes('already submitted')) {
        errorMsg = 'You have already voted in this census scope';
      } else if (err?.message?.includes('not registered')) {
        errorMsg = 'You are not registered. Please contact admin.';
      } else if (err?.message) {
        errorMsg = err.message;
      }
      
      setError(errorMsg);
      setStatus('error');
      if (onError) {
        onError(errorMsg);
      }
    }
  }, [publicKey, connection, signTransaction, onProofSubmitted, onError]);

  const getButtonText = () => {
    switch (status) {
      case 'loading-identity':
        return 'Loading Identity...';
      case 'generating-proof':
        return 'Generating ZK Proof...';
      case 'verifying-offchain':
        return 'Verifying Proof...';
      case 'submitting':
        return 'Submitting...';
      case 'success':
        return '✅ Counted!';
      case 'error':
        return 'Try Again';
      default:
        return '🔐 Prove & Count Me';
    }
  };

  const isLoading = ['loading-identity', 'generating-proof', 'verifying-offchain', 'submitting'].includes(status);
  const isDisabled = disabled || isLoading || status === 'success' || !publicKey;

  return (
    <div className="space-y-4">
      <button
        onClick={handleProve}
        disabled={isDisabled}
        className={`
          w-full px-8 py-4 rounded-xl font-semibold text-lg
          transition-all duration-300 transform
          ${isDisabled
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 hover:scale-105 shadow-lg hover:shadow-xl'
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

      {status === 'generating-proof' && (
        <div className="p-4 bg-blue-900/30 border border-blue-500/50 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">🔐</span>
            <div>
              <p className="text-blue-300 font-medium">Generating Zero-Knowledge Proof</p>
              <p className="text-blue-200 text-sm mt-1">This may take 10-30 seconds...</p>
            </div>
          </div>
        </div>
      )}

      {status === 'verifying-offchain' && (
        <div className="p-4 bg-purple-900/30 border border-purple-500/50 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">🔍</span>
            <div>
              <p className="text-purple-300 font-medium">Verifying Proof Off-Chain</p>
              <p className="text-purple-200 text-sm mt-1">Real Groth16 verification with snarkjs...</p>
            </div>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="p-4 bg-green-900/30 border border-green-500/50 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-green-300 font-medium">Successfully Counted!</p>
              <p className="text-green-200 text-sm mt-1">Your vote has been recorded anonymously</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions to convert proof format
function hexToBytes64(point: string[]): Uint8Array {
  const bytes = new Uint8Array(64);
  // Point is [x, y, z] in projective coordinates, we need [x, y]
  const x = BigInt(point[0]);
  const y = BigInt(point[1]);
  
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number((x >> BigInt(i * 8)) & 0xFFn);
    bytes[32 + i] = Number((y >> BigInt(i * 8)) & 0xFFn);
  }
  return bytes;
}

function hexToBytes128(point: string[][]): Uint8Array {
  const bytes = new Uint8Array(128);
  // G2 point has 4 components: [[x.c0, x.c1], [y.c0, y.c1], [z.c0, z.c1]]
  const x0 = BigInt(point[0][0]);
  const x1 = BigInt(point[0][1]);
  const y0 = BigInt(point[1][0]);
  const y1 = BigInt(point[1][1]);
  
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number((x0 >> BigInt(i * 8)) & 0xFFn);
    bytes[32 + i] = Number((x1 >> BigInt(i * 8)) & 0xFFn);
    bytes[64 + i] = Number((y0 >> BigInt(i * 8)) & 0xFFn);
    bytes[96 + i] = Number((y1 >> BigInt(i * 8)) & 0xFFn);
  }
  return bytes;
}