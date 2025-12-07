/**
 * Zassport Callback Page
 * 
 * Handles the return from Zassport verification.
 * Users are redirected here after completing passport verification.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function ZassportCallback() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing verification...');
  
  useEffect(() => {
    // Parse URL parameters from Zassport callback
    const { success, wallet, pda, nullifier, error } = router.query;
    
    if (!router.isReady) return;
    
    if (success === 'true' || pda) {
      setStatus('success');
      setMessage('Passport verification complete!');
      
      // Store verification data for the main app
      if (typeof window !== 'undefined') {
        const verificationData = {
          verified: true,
          wallet: wallet as string,
          pda: pda as string,
          nullifier: nullifier as string,
          timestamp: Date.now(),
        };
        
        localStorage.setItem('zassport-verification', JSON.stringify(verificationData));
        
        // Notify opener window if exists
        if (window.opener) {
          window.opener.postMessage({ 
            type: 'ZASSPORT_VERIFIED',
            data: verificationData 
          }, window.location.origin);
        }
      }
      
      // Auto-redirect after 2 seconds
      setTimeout(() => {
        router.push('/?tab=register');
      }, 2000);
      
    } else if (error) {
      setStatus('error');
      setMessage(decodeURIComponent(error as string) || 'Verification failed');
    } else {
      // No params yet, might still be loading
      setTimeout(() => {
        if (status === 'loading') {
          setStatus('success');
          setMessage('Verification status updated. Redirecting...');
          router.push('/?tab=register');
        }
      }, 3000);
    }
  }, [router.isReady, router.query]);
  
  return (
    <>
      <Head>
        <title>Zassport Verification | ZK Census</title>
      </Head>
      
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="fixed inset-0 gradient-mesh pointer-events-none" />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-10 text-center max-w-md mx-4 relative"
        >
          {status === 'loading' && (
            <>
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="text-4xl"
                >
                  🛂
                </motion.div>
              </div>
              <h1 className="text-2xl font-bold mb-2">Processing...</h1>
              <p className="text-gray-400">{message}</p>
            </>
          )}
          
          {status === 'success' && (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.5 }}
                className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center text-4xl shadow-lg shadow-emerald-500/20"
              >
                ✅
              </motion.div>
              <h1 className="text-2xl font-bold mb-2 text-emerald-400">Verified!</h1>
              <p className="text-gray-400 mb-6">{message}</p>
              <p className="text-sm text-gray-500">Redirecting to registration...</p>
              
              <Link 
                href="/?tab=register"
                className="mt-6 inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-medium transition-colors"
              >
                Continue to Registration →
              </Link>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center text-4xl shadow-lg shadow-red-500/20">
                ❌
              </div>
              <h1 className="text-2xl font-bold mb-2 text-red-400">Verification Failed</h1>
              <p className="text-gray-400 mb-6">{message}</p>
              
              <div className="flex gap-4 justify-center">
                <a
                  href="https://zassport.vercel.app/verify"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-colors"
                >
                  Try Again
                </a>
                <Link
                  href="/"
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-colors"
                >
                  Go Home
                </Link>
              </div>
            </>
          )}
        </motion.div>
      </div>
      
      <style jsx global>{`
        .gradient-mesh {
          background: 
            radial-gradient(at 20% 30%, rgba(16, 185, 129, 0.1) 0px, transparent 50%),
            radial-gradient(at 80% 70%, rgba(59, 130, 246, 0.1) 0px, transparent 50%);
        }
        
        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
        }
      `}</style>
    </>
  );
}
