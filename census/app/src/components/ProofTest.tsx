'use client';

import { useState } from 'react';
import { generateProof } from '@/lib/zkProof';

/**
 * Diagnostic component to test ZK proof generation in the browser
 */
export default function ProofTest() {
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<string>('');
  const [time, setTime] = useState<number>(0);

  const runTest = async () => {
    setStatus('testing');
    setResult('');
    
    try {
      console.log('🧪 Starting browser proof generation test...');
      
      // Test inputs (same as Node.js test)
      const testInputs = {
        identityNullifier: BigInt('12345678901234567890'),
        identityTrapdoor: BigInt('98765432109876543210'),
        treePathIndices: new Array(20).fill(0),
        treeSiblings: new Array(20).fill(new Uint8Array(32)),
        signalHash: BigInt(1),
        externalNullifier: BigInt(2),
      };
      
      console.log('📝 Test inputs:', {
        identityNullifier: testInputs.identityNullifier.toString(),
        treeDepth: testInputs.treePathIndices.length,
      });
      
      const startTime = performance.now();
      
      const { proof, publicSignals } = await generateProof(testInputs);
      
      const elapsed = performance.now() - startTime;
      setTime(elapsed);
      
      console.log('✅ Proof generated!');
      console.log('Proof:', proof);
      console.log('Public signals:', publicSignals);
      
      setResult(`Success! Generated proof in ${(elapsed / 1000).toFixed(2)}s\n\n` +
               `Public signals:\n` +
               `- Root: ${publicSignals[0].slice(0, 20)}...\n` +
               `- Nullifier: ${publicSignals[1].slice(0, 20)}...\n` +
               `- Signal: ${publicSignals[2]}\n` +
               `- External: ${publicSignals[3]}`);
      
      setStatus('success');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      
      let errorMsg = 'Unknown error';
      if (error instanceof Error) {
        errorMsg = `${error.name}: ${error.message}\n\nStack:\n${error.stack}`;
      } else {
        errorMsg = String(error);
      }
      
      setResult(`Error: ${errorMsg}`);
      setStatus('error');
    }
  };

  return (
    <div className="p-6 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
      <h2 className="text-xl font-bold mb-4">🧪 ZK Proof Generation Test</h2>
      
      <p className="text-sm opacity-80 mb-4">
        This test verifies that snarkjs can generate proofs in the browser environment.
        It uses the same test inputs as the successful Node.js test (2.39s).
      </p>
      
      <button
        onClick={runTest}
        disabled={status === 'testing'}
        className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 
                   rounded-lg font-semibold transition-colors"
      >
        {status === 'idle' && '▶️ Run Test'}
        {status === 'testing' && '⏳ Generating Proof...'}
        {status === 'success' && '✅ Test Passed'}
        {status === 'error' && '❌ Test Failed'}
      </button>
      
      {time > 0 && status === 'success' && (
        <div className="mt-4 p-4 bg-green-900/30 rounded border border-green-500/30">
          <p className="font-mono text-sm">⏱️ Time: {(time / 1000).toFixed(2)}s</p>
        </div>
      )}
      
      {result && (
        <div className={`mt-4 p-4 rounded border font-mono text-xs whitespace-pre-wrap
                        ${status === 'success' 
                          ? 'bg-green-900/30 border-green-500/30' 
                          : 'bg-red-900/30 border-red-500/30'}`}>
          {result}
        </div>
      )}
      
      <div className="mt-4 text-xs opacity-60">
        <p>💡 Check browser console for detailed logs</p>
        <p>📁 Circuit files should be in /circuits/ directory</p>
      </div>
    </div>
  );
}
