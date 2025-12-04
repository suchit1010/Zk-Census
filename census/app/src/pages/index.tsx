import Head from 'next/head';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { ToastContainer } from '@/components/Toast';
import { useToast } from '@/hooks/useToast';
import { buildRegisterCitizenTx } from '@/lib/census';
import { 
  verifyZassportIdentity, 
  generateCensusIdentityFromZassport, 
  getZassportURL,
  type ZassportIdentity 
} from '@/lib/zassport';
import { PublicKey } from '@solana/web3.js';
import Link from 'next/link';

const INDEXER_API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:4000';
const VERIFIER_API_URL = process.env.NEXT_PUBLIC_VERIFIER_API_URL || 'http://localhost:3001';
const CENSUS_PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');

const WalletButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

// ============================================================================
// Types
// ============================================================================

interface IdentityData {
  identityNullifier: string;
  identityTrapdoor: string;
  identityCommitment: string;
  leafIndex?: number;
  registeredAt?: number;
  txSignature?: string;
  zassportLinked?: boolean;
}

interface IndexerStats {
  leafCount: number;
  merkleRoot: string;
  depth?: number;
}

type ActiveTab = 'home' | 'register' | 'prove';
type RegistrationStep = 'connect' | 'verify-zassport' | 'generate-identity' | 'complete';
type ProofStatus = 'idle' | 'generating' | 'verifying' | 'submitting' | 'success' | 'error';

// ============================================================================
// Components
// ============================================================================

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const duration = 1000;
    let startTime: number;
    let animationFrame: number;
    const startValue = displayValue;
    
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(startValue + (value - startValue) * easeOut));
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value]);
  
  return <span className="tabular-nums">{displayValue.toLocaleString()}</span>;
}

function StepIndicator({ 
  step, 
  currentStep, 
  title, 
  description 
}: { 
  step: number; 
  currentStep: number; 
  title: string; 
  description: string;
}) {
  const isComplete = currentStep > step;
  const isActive = currentStep === step;
  
  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl transition-all duration-300 ${
      isComplete ? 'bg-emerald-500/10 border border-emerald-500/30' : 
      isActive ? 'bg-blue-500/10 border border-blue-500/30' : 
      'bg-white/[0.03] border border-white/[0.08]'
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
        isComplete ? 'bg-emerald-500 text-white' : 
        isActive ? 'bg-blue-500 text-white animate-pulse' : 
        'bg-white/10 text-gray-500'
      }`}>
        {isComplete ? '✓' : step}
      </div>
      <div>
        <h4 className={`font-semibold ${isComplete || isActive ? 'text-white' : 'text-gray-400'}`}>
          {title}
        </h4>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function Home() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const toast = useToast();
  
  // State
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [identity, setIdentity] = useState<IdentityData | null>(null);
  const [indexerStats, setIndexerStats] = useState<IndexerStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [proofStatus, setProofStatus] = useState<ProofStatus>('idle');
  
  // Zassport state
  const [zassportIdentity, setZassportIdentity] = useState<ZassportIdentity | null>(null);
  const [zassportChecking, setZassportChecking] = useState(false);
  const [zassportEligible, setZassportEligible] = useState(false);
  const [zassportReason, setZassportReason] = useState<string>('');
  
  // Refs to prevent duplicate operations
  const zassportCheckRef = useRef<string | null>(null);
  const credentialsLoadedRef = useRef(false);
  // Calculate current registration step
  const getRegistrationStep = (): number => {
    if (!connected) return 1;
    if (!zassportEligible) return 2;
    // Step 3: Submit request (not done yet)
    if (!registrationStatus?.request) return 3;
    // Step 4: Waiting for approval
    if (registrationStatus.request.status === 'pending') return 4;
    // If rejected, go back to step 3
    if (registrationStatus.request.status === 'rejected') return 3;
    // Step 5: Approved and registered
    if (registrationStatus.request.status === 'approved' && identity?.leafIndex !== undefined) return 5;
    // Approved but no credentials yet
    if (registrationStatus.request.status === 'approved') return 4;
    return 3;
  };

  const currentStep = getRegistrationStep();

  // Load identity from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('zk-census-identity');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.identityCommitment) {
          setIdentity(parsed);
        }
      } catch (e) {
        localStorage.removeItem('zk-census-identity');
      }
    }
  }, []);

  // Fetch indexer stats
  const fetchIndexerStats = useCallback(async () => {
    try {
      const res = await fetch(`${INDEXER_API_URL}/tree-info`);
      if (res.ok) {
        const data = await res.json();
        setIndexerStats(data);
      }
    } catch (e) {
      console.warn('Could not fetch indexer stats');
    }
  }, []);

  useEffect(() => {
    fetchIndexerStats();
    const interval = setInterval(fetchIndexerStats, 10000);
    return () => clearInterval(interval);
  }, [fetchIndexerStats]);

  // Check Zassport identity when wallet connects
  const checkZassport = useCallback(async () => {
    if (!publicKey || !connection) return;
    
    // Prevent duplicate checks for the same wallet
    const walletKey = publicKey.toBase58();
    if (zassportCheckRef.current === walletKey && zassportEligible) {
      return; // Already checked and eligible
    }
    
    setZassportChecking(true);
    try {
      const result = await verifyZassportIdentity(connection, publicKey);
      
      if (result.hasIdentity && result.identity) {
        setZassportIdentity(result.identity);
        setZassportEligible(result.isEligible);
        setZassportReason(result.reason || '');
        zassportCheckRef.current = walletKey; // Mark as checked
        
        if (result.isEligible) {
          toast.success('Zassport Verified!', 'Your passport verification is valid.');
        }
      } else {
        setZassportIdentity(null);
        setZassportEligible(false);
        setZassportReason(result.reason || 'No Zassport identity found.');
      }
    } catch (error: any) {
      console.error('Zassport check failed:', error);
      setZassportEligible(false);
      setZassportReason(error.message?.includes('429') 
        ? 'RPC rate limit reached. Please wait a moment and try again.'
        : 'Failed to verify Zassport identity. Check console for details.');
    } finally {
      setZassportChecking(false);
    }
  }, [publicKey, connection, toast, zassportEligible]);

  useEffect(() => {
    if (connected && publicKey) {
      // Only check once when wallet connects
      const walletKey = publicKey.toBase58();
      if (zassportCheckRef.current !== walletKey) {
        checkZassport();
      }
    } else {
      setZassportIdentity(null);
      setZassportEligible(false);
      zassportCheckRef.current = null;
    }
  }, [connected, publicKey]); // Removed checkZassport from deps to prevent re-running

  // Registration status state
  const [registrationStatus, setRegistrationStatus] = useState<{
    found: boolean;
    request?: {
      id: string;
      status: 'pending' | 'approved' | 'rejected';
      requestedAt: number;
      processedAt?: number;
      leafIndex?: number;
      rejectionReason?: string;
    };
  } | null>(null);

  // Check registration status
  const checkRegistrationStatus = useCallback(async () => {
    if (!publicKey) return;

    try {
      const res = await fetch(`/api/registration/status/${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        setRegistrationStatus(data);
        
        // If approved and has credentials, load them (only once)
        if (data.request?.status === 'approved' && 
            data.request?.leafIndex !== undefined && 
            !credentialsLoadedRef.current) {
          credentialsLoadedRef.current = true; // Prevent re-loading
          try {
            const credRes = await fetch(`/api/credentials/${publicKey.toBase58()}`);
            if (credRes.ok) {
              const credData = await credRes.json();
              if (credData.found && credData.credentials) {
                const newIdentity: IdentityData = {
                  identityNullifier: credData.credentials.identityNullifier,
                  identityTrapdoor: credData.credentials.identityTrapdoor,
                  identityCommitment: credData.credentials.identityCommitment,
                  leafIndex: credData.credentials.leafIndex,
                  registeredAt: credData.credentials.registeredAt || Date.now(),
                  zassportLinked: true,
                };
                localStorage.setItem('zk-census-identity', JSON.stringify(newIdentity));
                setIdentity(newIdentity);
              }
            }
          } catch (e) {
            console.warn('Could not fetch credentials');
            credentialsLoadedRef.current = false; // Allow retry on error
          }
        }
      }
    } catch (e) {
      console.warn('Could not check registration status');
    }
  }, [publicKey]); // Removed identity from deps

  useEffect(() => {
    if (publicKey) {
      // Reset credentials loaded flag when wallet changes
      credentialsLoadedRef.current = false;
      checkRegistrationStatus();
      // Poll every 30 seconds instead of 10
      const interval = setInterval(checkRegistrationStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [publicKey, checkRegistrationStatus]);

  // Submit registration REQUEST (NOT direct registration)
  // Admin will approve/reject and handle on-chain registration
  const handleSubmitRegistrationRequest = async () => {
    if (!publicKey || !zassportIdentity) {
      toast.error('Not ready', 'Please verify with Zassport first.');
      return;
    }

    setIsLoading(true);
    try {
      // Submit request to API for admin approval
      const res = await fetch('/api/registration/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey: publicKey.toBase58(),
          zassportCommitment: Array.from(zassportIdentity.commitment),
          zassportNullifier: Array.from(zassportIdentity.nullifier),
          ageVerified: zassportIdentity.ageVerified,
          nationalityVerified: zassportIdentity.nationalityVerified,
          nationality: zassportIdentity.nationality,
        })
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to submit registration request');
      }

      toast.success('Request Submitted!', 'Waiting for admin approval');
      
      // Refresh status
      await checkRegistrationStatus();
      
    } catch (err: any) {
      console.error('Registration request failed:', err);
      toast.error('Request Failed', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate and submit proof
  const handleProve = async () => {
    if (!identity || identity.leafIndex === undefined) {
      toast.error('Not registered', 'Please complete registration first.');
      return;
    }

    setProofStatus('generating');
    try {
      // Step 1: Fetch Merkle proof
      console.log('📥 Fetching Merkle proof...');
      const proofRes = await fetch(`${INDEXER_API_URL}/merkle-proof/${identity.identityCommitment}`);
      if (!proofRes.ok) throw new Error('Failed to fetch Merkle proof');
      const merkleProof = await proofRes.json();

      // Step 2: Generate ZK proof
      console.log('🔐 Generating Groth16 proof...');
      const treeSiblings = merkleProof.pathElements.map((elem: string) => {
        const bigInt = BigInt(elem);
        const bytes = new Uint8Array(32);
        let temp = bigInt;
        for (let i = 0; i < 32; i++) {
          bytes[i] = Number(temp & 0xFFn);
          temp >>= 8n;
        }
        return bytes;
      });
      
      const { generateProof } = await import('@/lib/zkProof');
      const { proof, publicSignals } = await generateProof({
        identityNullifier: BigInt(identity.identityNullifier),
        identityTrapdoor: BigInt(identity.identityTrapdoor),
        treePathIndices: merkleProof.pathIndices,
        treeSiblings,
        signalHash: BigInt(1),
        externalNullifier: BigInt(1),
      });

      // Step 3: Verify proof
      setProofStatus('verifying');
      console.log('🔍 Verifying proof...');
      const verifyRes = await fetch(`${VERIFIER_API_URL}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, publicSignals }),
      });
      
      const verifyResult = await verifyRes.json();
      if (!verifyResult.success) {
        throw new Error(verifyResult.error || 'Proof verification failed');
      }

      setProofStatus('success');
      toast.success('Proof Verified!', 'Your census participation is confirmed.');
      
    } catch (err: any) {
      console.error('Proof failed:', err);
      setProofStatus('error');
      toast.error('Proof Failed', err.message);
    }
  };

  const clearIdentity = () => {
    localStorage.removeItem('zk-census-identity');
    setIdentity(null);
    setProofStatus('idle');
    toast.success('Identity Cleared', 'You can register again.');
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      <Head>
        <title>ZK Census | Network School</title>
        <meta name="description" content="Privacy-preserving census on Solana with Zassport verification" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#0a0a0f] text-white">
        {/* Background Effects */}
        <div className="fixed inset-0 gradient-mesh pointer-events-none" />
        <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-30" />
        
        {/* Navigation */}
        <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0a0a0f]/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                  <span className="text-xl">🏛️</span>
                </div>
                <div>
                  <h1 className="font-bold text-lg">ZK Census</h1>
                  <p className="text-xs text-gray-500">Network School</p>
                </div>
              </div>
              
              {/* Navigation Tabs */}
              <div className="hidden md:flex items-center gap-1 bg-white/[0.03] rounded-xl p-1">
                {[
                  { id: 'home', label: 'Home', icon: '🏠' },
                  { id: 'register', label: 'Register', icon: '📝' },
                  { id: 'prove', label: 'Prove', icon: '🔐' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as ActiveTab)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab.id 
                        ? 'bg-white/10 text-white' 
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="mr-2">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
              
              {/* Right Side */}
              <div className="flex items-center gap-4">
                <Link 
                  href="/admin" 
                  className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <span>👮</span>
                  Admin
                </Link>
                <WalletButton />
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-6"
            >
              <p className="text-gray-400 text-sm mb-1">Registered Citizens</p>
              <p className="text-3xl font-bold text-emerald-400">
                <AnimatedNumber value={indexerStats?.leafCount || 0} />
              </p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.1 }}
              className="glass-card p-6"
            >
              <p className="text-gray-400 text-sm mb-1">Network Status</p>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${indexerStats ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xl font-bold">{indexerStats ? 'Online' : 'Offline'}</span>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.2 }}
              className="glass-card p-6"
            >
              <p className="text-gray-400 text-sm mb-1">Your Status</p>
              <p className="text-xl font-bold">
                {identity?.leafIndex !== undefined ? (
                  <span className="text-emerald-400">✅ Registered</span>
                ) : connected ? (
                  <span className="text-yellow-400">⏳ Not Registered</span>
                ) : (
                  <span className="text-gray-500">Not Connected</span>
                )}
              </p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.3 }}
              className="glass-card p-6"
            >
              <p className="text-gray-400 text-sm mb-1">Zassport</p>
              <p className="text-xl font-bold">
                {zassportChecking ? (
                  <span className="text-blue-400">🔍 Checking...</span>
                ) : zassportEligible ? (
                  <span className="text-emerald-400">✅ Verified</span>
                ) : connected ? (
                  <span className="text-yellow-400">❌ Not Verified</span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </p>
            </motion.div>
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {/* HOME TAB */}
            {activeTab === 'home' && (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Hero Section */}
                <div className="glass-card p-8 md:p-12 text-center">
                  <h2 className="text-3xl md:text-5xl font-bold mb-4">
                    Privacy-Preserving Census
                  </h2>
                  <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
                    Prove you&apos;re a real person and participate in the Network School census 
                    without revealing your identity. Powered by zero-knowledge proofs and 
                    Zassport passport verification.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button 
                      onClick={() => setActiveTab('register')}
                      className="btn-primary"
                    >
                      Get Started →
                    </button>
                    <a 
                      href="https://zassport.vercel.app" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn-ghost"
                    >
                      Learn About Zassport
                    </a>
                  </div>
                </div>

                {/* How It Works */}
                <div className="grid md:grid-cols-3 gap-6">
                  {[
                    {
                      step: '01',
                      title: 'Verify with Zassport',
                      description: 'Scan your passport using NFC at zassport.vercel.app. Your data stays on your device.',
                      icon: '🛂',
                      color: 'from-blue-500/20',
                    },
                    {
                      step: '02',
                      title: 'Register Identity',
                      description: 'Generate a ZK identity linked to your passport verification. No personal data stored.',
                      icon: '🔐',
                      color: 'from-purple-500/20',
                    },
                    {
                      step: '03',
                      title: 'Prove & Participate',
                      description: 'Generate ZK proofs to participate anonymously in the census. Your identity remains hidden.',
                      icon: '✅',
                      color: 'from-emerald-500/20',
                    },
                  ].map((item, index) => (
                    <motion.div
                      key={item.step}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * index }}
                      className={`glass-card p-6 relative overflow-hidden`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${item.color} to-transparent opacity-50`} />
                      <div className="relative">
                        <div className="text-4xl mb-4">{item.icon}</div>
                        <div className="text-5xl font-bold text-white/10 absolute top-0 right-4">
                          {item.step}
                        </div>
                        <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                        <p className="text-gray-400 text-sm">{item.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Architecture Info */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="glass-card p-6">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <span>🏗️</span> Architecture
                    </h3>
                    <div className="space-y-3">
                      {[
                        { label: 'Frontend', value: 'Next.js + Solana Wallet', status: 'online' },
                        { label: 'Indexer API', value: 'Port 4000 - Merkle Tree', status: indexerStats ? 'online' : 'offline' },
                        { label: 'Verifier API', value: 'Port 3001 - Groth16', status: 'online' },
                        { label: 'Blockchain', value: 'Solana Devnet', status: 'online' },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between py-2 border-b border-white/5">
                          <span className="text-gray-400">{item.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{item.value}</span>
                            <span className={`w-2 h-2 rounded-full ${item.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass-card p-6">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <span>🌳</span> Merkle Tree
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-white/5">
                        <span className="text-gray-400">Total Leaves</span>
                        <span className="font-mono">{indexerStats?.leafCount || 0}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-white/5">
                        <span className="text-gray-400">Tree Depth</span>
                        <span className="font-mono">20</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-white/5">
                        <span className="text-gray-400">Max Capacity</span>
                        <span className="font-mono">1,048,576</span>
                      </div>
                      {indexerStats?.merkleRoot && (
                        <div className="pt-2">
                          <p className="text-gray-400 text-sm mb-1">Current Root:</p>
                          <code className="text-xs text-emerald-400 break-all">
                            {indexerStats.merkleRoot.slice(0, 40)}...
                          </code>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* REGISTER TAB */}
            {activeTab === 'register' && (
              <motion.div
                key="register"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-2xl mx-auto"
              >
                <div className="glass-card p-8">
                  <h2 className="text-2xl font-bold mb-6">Register as Citizen</h2>
                  
                  {/* Step Indicators */}
                  <div className="space-y-4 mb-8">
                    <StepIndicator
                      step={1}
                      currentStep={currentStep}
                      title="Connect Wallet"
                      description="Connect your Solana wallet"
                    />
                    <StepIndicator
                      step={2}
                      currentStep={currentStep}
                      title="Verify with Zassport"
                      description="Scan your passport to prove you're a real person"
                    />
                    <StepIndicator
                      step={3}
                      currentStep={currentStep}
                      title="Submit Registration"
                      description="Request to join the census"
                    />
                    <StepIndicator
                      step={4}
                      currentStep={currentStep}
                      title="Admin Approval"
                      description="Wait for verification by census admin"
                    />
                    <StepIndicator
                      step={5}
                      currentStep={currentStep}
                      title="Get Credentials"
                      description="Receive your ZK identity credentials"
                    />
                  </div>

                  {/* Dynamic Content Based on Step */}
                  <div className="space-y-6">
                    {/* Step 1: Connect Wallet */}
                    {currentStep === 1 && (
                      <div className="text-center py-8">
                        <div className="text-6xl mb-4">🔌</div>
                        <h3 className="text-xl font-bold mb-2">Connect Your Wallet</h3>
                        <p className="text-gray-400 mb-6">
                          Connect your Solana wallet to get started.
                        </p>
                        <WalletButton />
                      </div>
                    )}

                    {/* Step 2: Verify Zassport */}
                    {currentStep === 2 && (
                      <div className="space-y-6">
                        {zassportChecking ? (
                          <div className="text-center py-8">
                            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-gray-400">Checking Zassport verification...</p>
                          </div>
                        ) : (
                          <>
                            <div className="p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                              <div className="flex items-start gap-4">
                                <span className="text-3xl">🛂</span>
                                <div>
                                  <h4 className="font-bold text-yellow-400 mb-1">Zassport Verification Required</h4>
                                  <p className="text-gray-400 text-sm mb-4">
                                    {zassportReason || 'You need to verify your passport with Zassport before registering for the census.'}
                                  </p>
                                  <a
                                    href={getZassportURL(publicKey?.toBase58())}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-xl hover:from-blue-400 hover:to-purple-400 transition-all"
                                  >
                                    🛂 Verify with Zassport →
                                  </a>
                                </div>
                              </div>
                            </div>

                            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                              <h4 className="font-semibold text-blue-400 mb-2">What is Zassport?</h4>
                              <p className="text-gray-400 text-sm">
                                Zassport is a privacy-preserving passport verification system. 
                                Scan your passport using NFC, and Zassport creates a cryptographic 
                                proof that you&apos;re a real adult human—without storing any personal data.
                              </p>
                            </div>

                            <button
                              onClick={checkZassport}
                              className="w-full btn-ghost"
                            >
                              🔄 Refresh Verification Status
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Step 3: Submit Registration Request */}
                    {currentStep === 3 && (
                      <div className="space-y-6">
                        {/* Zassport Verified Badge */}
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">✅</span>
                            <div>
                              <h4 className="font-bold text-emerald-400">Zassport Verified!</h4>
                              <p className="text-sm text-gray-400">
                                Your passport has been verified. Submit your registration request to join the census.
                              </p>
                            </div>
                          </div>
                          {zassportIdentity && (
                            <div className="mt-4 grid grid-cols-3 gap-4">
                              <div className="text-center p-2 bg-black/20 rounded-lg">
                                <p className="text-xs text-gray-400">Age</p>
                                <p className="font-bold text-emerald-400">
                                  {zassportIdentity.ageVerified ? '18+' : '—'}
                                </p>
                              </div>
                              <div className="text-center p-2 bg-black/20 rounded-lg">
                                <p className="text-xs text-gray-400">Nationality</p>
                                <p className="font-bold text-blue-400">
                                  {zassportIdentity.nationalityVerified ? '✓' : '—'}
                                </p>
                              </div>
                              <div className="text-center p-2 bg-black/20 rounded-lg">
                                <p className="text-xs text-gray-400">Sanctions</p>
                                <p className="font-bold text-purple-400">
                                  {zassportIdentity.sanctionsVerified ? 'Clear' : '—'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Show rejection reason if previously rejected */}
                        {registrationStatus?.request?.status === 'rejected' && (
                          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">❌</span>
                              <div>
                                <h4 className="font-bold text-red-400">Previous Request Rejected</h4>
                                <p className="text-sm text-gray-400">
                                  {registrationStatus.request.rejectionReason || 'Your previous registration request was rejected. You may submit a new request.'}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Info Box */}
                        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                          <h4 className="font-semibold text-blue-400 mb-2">🛡️ Sybil-Resistant Registration</h4>
                          <p className="text-gray-400 text-sm">
                            To prevent duplicate registrations, an admin will verify your Zassport credentials 
                            before adding you to the census. This ensures one person = one vote.
                          </p>
                        </div>

                        {/* Submit Request Button */}
                        <button
                          onClick={handleSubmitRegistrationRequest}
                          disabled={isLoading}
                          className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
                            isLoading
                              ? 'bg-gray-600 cursor-not-allowed'
                              : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 hover:shadow-lg hover:shadow-emerald-500/30'
                          }`}
                        >
                          {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Submitting Request...
                            </span>
                          ) : (
                            '📝 Submit Registration Request'
                          )}
                        </button>

                        <p className="text-xs text-gray-500 text-center">
                          Your request will be reviewed by a census admin. You&apos;ll receive your ZK credentials once approved.
                        </p>
                      </div>
                    )}

                    {/* Step 4: Waiting for Approval */}
                    {currentStep === 4 && (
                      <div className="space-y-6">
                        <div className="p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-center">
                          <div className="text-6xl mb-4">⏳</div>
                          <h3 className="text-2xl font-bold text-yellow-400 mb-2">
                            Awaiting Admin Approval
                          </h3>
                          <p className="text-gray-400">
                            Your registration request has been submitted and is being reviewed.
                          </p>
                        </div>

                        <div className="p-4 bg-white/[0.03] rounded-xl space-y-3">
                          <div className="flex justify-between py-2 border-b border-white/5">
                            <span className="text-gray-400">Request ID</span>
                            <span className="font-mono text-blue-400 text-sm">
                              {registrationStatus?.request?.id?.slice(0, 16)}...
                            </span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-white/5">
                            <span className="text-gray-400">Submitted</span>
                            <span className="font-mono">
                              {registrationStatus?.request?.requestedAt 
                                ? new Date(registrationStatus.request.requestedAt).toLocaleString()
                                : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between py-2">
                            <span className="text-gray-400">Status</span>
                            <span className="inline-flex items-center gap-2 text-yellow-400">
                              <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                              Pending Review
                            </span>
                          </div>
                        </div>

                        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                          <h4 className="font-semibold text-blue-400 mb-2">💡 What happens next?</h4>
                          <ul className="text-gray-400 text-sm space-y-1">
                            <li>• An admin will verify your Zassport credentials</li>
                            <li>• Once approved, your ZK identity will be created</li>
                            <li>• You&apos;ll be added to the census Merkle tree</li>
                            <li>• Refresh this page to check your status</li>
                          </ul>
                        </div>

                        <button
                          onClick={checkRegistrationStatus}
                          disabled={isLoading}
                          className="w-full btn-ghost"
                        >
                          {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Checking...
                            </span>
                          ) : (
                            '🔄 Refresh Status'
                          )}
                        </button>
                      </div>
                    )}

                    {/* Step 5: Complete */}
                    {currentStep === 5 && identity && (
                      <div className="space-y-6">
                        <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                          <div className="text-6xl mb-4">🎉</div>
                          <h3 className="text-2xl font-bold text-emerald-400 mb-2">
                            Registration Complete!
                          </h3>
                          <p className="text-gray-400">
                            You are citizen #{(identity.leafIndex || 0) + 1} in the ZK Census.
                          </p>
                        </div>

                        <div className="p-4 bg-white/[0.03] rounded-xl space-y-3">
                          <div className="flex justify-between py-2 border-b border-white/5">
                            <span className="text-gray-400">Leaf Index</span>
                            <span className="font-mono text-emerald-400">#{identity.leafIndex}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-white/5">
                            <span className="text-gray-400">Registered</span>
                            <span className="font-mono">
                              {new Date(identity.registeredAt || 0).toLocaleDateString()}
                            </span>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Commitment:</p>
                            <code className="text-xs text-emerald-400 break-all">
                              {identity.identityCommitment.slice(0, 40)}...
                            </code>
                          </div>
                          {identity.txSignature && (
                            <div>
                              <a
                                href={`https://explorer.solana.com/tx/${identity.txSignature}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline text-sm"
                              >
                                View Transaction →
                              </a>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => setActiveTab('prove')}
                          className="w-full btn-primary"
                        >
                          🔐 Generate Census Proof →
                        </button>

                        <button
                          onClick={clearIdentity}
                          className="w-full text-sm text-red-400 hover:text-red-300"
                        >
                          🗑️ Clear Identity (for testing)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* PROVE TAB */}
            {activeTab === 'prove' && (
              <motion.div
                key="prove"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-2xl mx-auto"
              >
                <div className="glass-card p-8">
                  <h2 className="text-2xl font-bold mb-6">Generate Census Proof</h2>

                  {!identity?.leafIndex ? (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">🔒</div>
                      <h3 className="text-xl font-bold mb-2">Registration Required</h3>
                      <p className="text-gray-400 mb-6">
                        You need to complete registration before generating proofs.
                      </p>
                      <button
                        onClick={() => setActiveTab('register')}
                        className="btn-primary"
                      >
                        Go to Registration →
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Identity Info */}
                      <div className="p-4 bg-white/[0.03] rounded-xl">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-2xl">👤</span>
                          <div>
                            <h4 className="font-bold">Your Census Identity</h4>
                            <p className="text-sm text-gray-400">Citizen #{identity.leafIndex + 1}</p>
                          </div>
                        </div>
                        <code className="text-xs text-emerald-400 break-all block">
                          {identity.identityCommitment.slice(0, 50)}...
                        </code>
                      </div>

                      {/* Proof Status */}
                      <div className={`p-6 rounded-xl border ${
                        proofStatus === 'success' ? 'bg-emerald-500/10 border-emerald-500/30' :
                        proofStatus === 'error' ? 'bg-red-500/10 border-red-500/30' :
                        proofStatus !== 'idle' ? 'bg-blue-500/10 border-blue-500/30' :
                        'bg-white/[0.03] border-white/[0.08]'
                      }`}>
                        <div className="flex items-center gap-4 mb-4">
                          <span className="text-4xl">
                            {proofStatus === 'success' ? '✅' :
                             proofStatus === 'error' ? '❌' :
                             proofStatus === 'generating' ? '⚙️' :
                             proofStatus === 'verifying' ? '🔍' :
                             proofStatus === 'submitting' ? '📤' :
                             '🔐'}
                          </span>
                          <div>
                            <p className="font-bold text-lg">
                              {proofStatus === 'success' ? 'Proof Verified!' :
                               proofStatus === 'error' ? 'Proof Failed' :
                               proofStatus === 'generating' ? 'Generating Proof...' :
                               proofStatus === 'verifying' ? 'Verifying...' :
                               proofStatus === 'submitting' ? 'Submitting...' :
                               'Ready to Prove'}
                            </p>
                            <p className="text-sm text-gray-400">
                              {proofStatus === 'success' ? 'Your participation is confirmed anonymously' :
                               proofStatus === 'error' ? 'Something went wrong' :
                               proofStatus === 'generating' ? 'Building Groth16 proof (~2-3s)' :
                               proofStatus === 'verifying' ? 'Checking proof validity' :
                               proofStatus === 'submitting' ? 'Recording on Solana' :
                               'Generate a ZK proof to participate in the census'}
                            </p>
                          </div>
                        </div>

                        {proofStatus === 'idle' && (
                          <button
                            onClick={handleProve}
                            className="w-full btn-primary"
                          >
                            🔐 Generate & Submit Proof
                          </button>
                        )}

                        {(proofStatus === 'generating' || proofStatus === 'verifying' || proofStatus === 'submitting') && (
                          <div className="w-full py-3 bg-blue-500/20 rounded-xl text-center">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                              Processing...
                            </span>
                          </div>
                        )}

                        {proofStatus === 'success' && (
                          <div className="space-y-4">
                            <div className="p-4 bg-black/20 rounded-lg">
                              <p className="text-sm text-gray-400 mb-2">What happened:</p>
                              <ul className="text-sm space-y-1">
                                <li className="text-emerald-400">✓ Generated Groth16 proof</li>
                                <li className="text-emerald-400">✓ Verified cryptographically</li>
                                <li className="text-emerald-400">✓ Nullifier prevents double-voting</li>
                                <li className="text-emerald-400">✓ Identity remains anonymous</li>
                              </ul>
                            </div>
                            <button
                              onClick={() => setProofStatus('idle')}
                              className="w-full btn-ghost"
                            >
                              Generate Another Proof
                            </button>
                          </div>
                        )}

                        {proofStatus === 'error' && (
                          <button
                            onClick={() => setProofStatus('idle')}
                            className="w-full px-6 py-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/30 transition-all"
                          >
                            Try Again
                          </button>
                        )}
                      </div>

                      {/* Privacy Info */}
                      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                        <h4 className="font-semibold text-blue-400 mb-2">🔒 Privacy Guarantees</h4>
                        <ul className="text-sm text-gray-400 space-y-1">
                          <li>• Your identity commitment is a hash - cannot be reversed</li>
                          <li>• The proof reveals nothing about your passport</li>
                          <li>• Nullifiers prevent double-voting without linking to identity</li>
                          <li>• Even the admin cannot see who you are</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0f]/90 backdrop-blur-xl border-t border-white/[0.08] py-2 px-4 pb-safe">
          <div className="flex justify-around">
            {[
              { id: 'home', label: 'Home', icon: '🏠' },
              { id: 'register', label: 'Register', icon: '📝' },
              { id: 'prove', label: 'Prove', icon: '🔐' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ActiveTab)}
                className={`flex flex-col items-center py-2 px-4 rounded-lg ${
                  activeTab === tab.id ? 'text-emerald-400' : 'text-gray-400'
                }`}
              >
                <span className="text-xl">{tab.icon}</span>
                <span className="text-xs mt-1">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <ToastContainer toasts={toast.toasts} onClose={toast.dismiss} />
      </div>
    </>
  );
}
