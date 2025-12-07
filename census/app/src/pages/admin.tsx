import Head from 'next/head';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ToastContainer } from '@/components/Toast';
import { useToast } from '@/hooks/useToast';

const INDEXER_API_URL = process.env.NEXT_PUBLIC_INDEXER_API_URL || 'http://localhost:4000';
const ADMIN_PUBKEY = process.env.NEXT_PUBLIC_ADMIN_PUBKEY || '';

const WalletButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

interface PendingRequest {
  id: string;
  walletPubkey: string;
  zassportPDA?: string;
  nullifier?: string;
  commitment?: string;
  zassportData?: {
    isValid: boolean;
    isAdult: boolean;
    nationality?: string;
    verifiedAt: number;
    expiresAt: number;
    passportHash?: string;
    sanctionsVerified?: boolean;
  };
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
}

interface RegistrationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface TreeStats {
  leafCount: number;
  merkleRoot: string;
  depth: number;
}

interface Citizen {
  commitment: string;
  leafIndex: number;
  registeredAt?: number;
}

// Animated counter
function AnimatedNumber({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    let animationFrame: number;
    const startValue = displayValue;
    
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(startValue + (value - startValue) * easeOut));
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);
  
  return <span className="tabular-nums">{displayValue.toLocaleString()}</span>;
}

// Time ago formatter
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminPage() {
  const { connected, publicKey } = useWallet();
  const toast = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'citizens' | 'stats'>('pending');
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<PendingRequest[]>([]);
  const [citizens, setCitizens] = useState<Citizen[]>([]);
  const [regStats, setRegStats] = useState<RegistrationStats | null>(null);
  const [treeStats, setTreeStats] = useState<TreeStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Check admin status
  useEffect(() => {
    if (publicKey) {
      const isAdminWallet = ADMIN_PUBKEY 
        ? publicKey.toBase58() === ADMIN_PUBKEY 
        : true; // Allow any wallet if no admin set (dev mode)
      setIsAdmin(isAdminWallet);
    } else {
      setIsAdmin(false);
    }
  }, [publicKey]);

  // Fetch pending requests from indexer API
  const fetchPendingRequests = useCallback(async () => {
    try {
      const res = await fetch(`${INDEXER_API_URL}/api/admin/pending`);
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.pending || []);
        setApprovedRequests(data.approved || []);
        setRegStats(data.stats || null);
      }
    } catch (e) {
      console.warn('Could not fetch pending requests');
    }
  }, []);

  // Fetch tree stats
  const fetchTreeStats = useCallback(async () => {
    try {
      const res = await fetch(`${INDEXER_API_URL}/tree-info`);
      if (res.ok) {
        const data = await res.json();
        setTreeStats({
          leafCount: data.leafCount,
          merkleRoot: data.merkleRoot,
          depth: data.depth || 20
        });
      }
    } catch (e) {
      console.warn('Could not fetch tree stats');
    }
  }, []);

  // Fetch citizens
  const fetchCitizens = useCallback(async () => {
    try {
      const res = await fetch(`${INDEXER_API_URL}/api/citizens`);
      if (res.ok) {
        const data = await res.json();
        setCitizens(data.citizens || []);
      }
    } catch (e) {
      console.warn('Could not fetch citizens');
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchPendingRequests();
      fetchTreeStats();
      fetchCitizens();
      const interval = setInterval(() => {
        fetchPendingRequests();
        fetchTreeStats();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, fetchPendingRequests, fetchTreeStats, fetchCitizens]);

  // Approve request
  const handleApprove = async (request: PendingRequest) => {
    if (!publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    setProcessingId(request.id);
    setIsLoading(true);

    try {
      // Approve in indexer API (handles on-chain registration via admin service)
      const approveRes = await fetch(`${INDEXER_API_URL}/api/admin/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          adminPubkey: publicKey.toBase58()
        })
      });

      const approveData = await approveRes.json();

      if (!approveData.success) {
        throw new Error(approveData.error || 'Approval failed');
      }

      toast.success('Registration Approved!', `Citizen at leaf #${approveData.leafIndex}`);
      
      fetchPendingRequests();
      fetchTreeStats();
      fetchCitizens();

    } catch (err: any) {
      console.error('Approval failed:', err);
      toast.error('Approval Failed', err.message);
    } finally {
      setIsLoading(false);
      setProcessingId(null);
    }
  };

  // Reject request
  const handleReject = async (request: PendingRequest, reason: string = 'Manual rejection by admin') => {
    if (!publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    setProcessingId(request.id);
    setIsLoading(true);

    try {
      const res = await fetch(`${INDEXER_API_URL}/api/admin/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          adminPubkey: publicKey.toBase58(),
          reason
        })
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Rejection failed');
      }

      toast.success('Request Rejected', reason);
      fetchPendingRequests();

    } catch (err: any) {
      toast.error('Rejection Failed', err.message);
    } finally {
      setIsLoading(false);
      setProcessingId(null);
    }
  };

  // Sync merkle root
  const handleSyncRoot = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${INDEXER_API_URL}/api/admin/sync-root`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPubkey: publicKey?.toBase58() })
      });
      
      const data = await res.json();
      if (data.success) {
        toast.success('Root Synced!', 'On-chain root updated');
        fetchTreeStats();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast.error('Sync Failed', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter citizens by search
  const filteredCitizens = citizens.filter(c => 
    c.commitment.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.leafIndex.toString().includes(searchQuery)
  );

  // Not connected
  if (!connected) {
    return (
      <>
        <Head>
          <title>Admin | ZK Census</title>
        </Head>
        <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
          <div className="fixed inset-0 gradient-mesh pointer-events-none" />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-10 text-center max-w-md mx-4 relative"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-4xl shadow-lg shadow-amber-500/20">
              👮
            </div>
            <h1 className="text-2xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-gray-400 mb-8">Connect your admin wallet to continue</p>
            <WalletButton />
          </motion.div>
        </div>
      </>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <>
        <Head>
          <title>Unauthorized | ZK Census</title>
        </Head>
        <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
          <div className="fixed inset-0 gradient-mesh pointer-events-none" />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-10 text-center max-w-md mx-4"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center text-4xl shadow-lg shadow-red-500/20">
              ⛔
            </div>
            <h1 className="text-2xl font-bold mb-2">Unauthorized</h1>
            <p className="text-gray-400 mb-4">This wallet is not authorized as admin</p>
            <code className="text-xs text-gray-500 bg-black/30 px-3 py-1 rounded-lg block truncate">
              {publicKey?.toBase58()}
            </code>
            <Link href="/" className="btn-ghost mt-6 inline-block">
              ← Back to Census
            </Link>
          </motion.div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Admin Dashboard | ZK Census</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#0a0a0f] text-white">
        {/* Background */}
        <div className="fixed inset-0 gradient-mesh pointer-events-none" />
        <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-20" />

        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-20">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-xl font-bold shadow-lg shadow-amber-500/20">
                  👮
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-lg font-bold">Admin Dashboard</h1>
                  <p className="text-xs text-gray-500">Census Management</p>
                </div>
              </div>

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center gap-1">
                {[
                  { id: 'pending', label: 'Pending', icon: '⏳', count: regStats?.pending },
                  { id: 'approved', label: 'Approved', icon: '✅' },
                  { id: 'citizens', label: 'Citizens', icon: '👥' },
                  { id: 'stats', label: 'Stats', icon: '📊' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                      activeTab === item.id
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                    {item.count !== undefined && item.count > 0 && (
                      <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                        {item.count}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              {/* Right side */}
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  ← Census
                </Link>
                <WalletButton />
                
                {/* Mobile menu button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {mobileMenuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="md:hidden border-t border-white/5 bg-[#0a0a0f]/95 backdrop-blur-xl"
              >
                <div className="px-4 py-4 space-y-2">
                  {[
                    { id: 'pending', label: 'Pending Requests', icon: '⏳', count: regStats?.pending },
                    { id: 'approved', label: 'Approved', icon: '✅' },
                    { id: 'citizens', label: 'All Citizens', icon: '👥' },
                    { id: 'stats', label: 'Statistics', icon: '📊' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full px-4 py-3 rounded-xl text-left font-medium transition-all flex items-center justify-between ${
                        activeTab === item.id
                          ? 'bg-white/10 text-white'
                          : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      <span>
                        <span className="mr-3">{item.icon}</span>
                        {item.label}
                      </span>
                      {item.count !== undefined && item.count > 0 && (
                        <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                          {item.count}
                        </span>
                      )}
                    </button>
                  ))}
                  <Link
                    href="/"
                    className="block w-full px-4 py-3 rounded-xl text-left font-medium text-gray-400 hover:bg-white/5"
                  >
                    <span className="mr-3">🏠</span>
                    Back to Census
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Main content */}
        <main className="pt-20 sm:pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 sm:p-6 card-hover"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">👥</span>
                <span className="badge badge-success">Total</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mb-1">Citizens</p>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-400">
                <AnimatedNumber value={treeStats?.leafCount || 0} />
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-4 sm:p-6 card-hover border-amber-500/20"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">⏳</span>
                {(regStats?.pending || 0) > 0 && (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mb-1">Pending</p>
              <p className="text-2xl sm:text-3xl font-bold text-amber-400">
                <AnimatedNumber value={regStats?.pending || 0} />
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card p-4 sm:p-6 card-hover"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">✅</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mb-1">Approved</p>
              <p className="text-2xl sm:text-3xl font-bold text-blue-400">
                <AnimatedNumber value={regStats?.approved || 0} />
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-4 sm:p-6 card-hover"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">❌</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mb-1">Rejected</p>
              <p className="text-2xl sm:text-3xl font-bold text-red-400">
                <AnimatedNumber value={regStats?.rejected || 0} />
              </p>
            </motion.div>
          </div>

          {/* Main Content */}
          <AnimatePresence mode="wait">
            {/* PENDING TAB */}
            {activeTab === 'pending' && (
              <motion.div
                key="pending"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="glass-card p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold">Pending Requests</h2>
                      <p className="text-gray-400 text-sm">Review and approve citizen registrations</p>
                    </div>
                    {pendingRequests.length > 0 && (
                      <span className="badge badge-warning text-sm">
                        {pendingRequests.length} waiting
                      </span>
                    )}
                  </div>

                  {pendingRequests.length === 0 ? (
                    <div className="text-center py-16">
                      <span className="text-6xl mb-4 block">📭</span>
                      <h3 className="text-xl font-semibold mb-2">No Pending Requests</h3>
                      <p className="text-gray-400 max-w-md mx-auto">
                        New registration requests will appear here when users submit with valid Zassport attestations.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingRequests.map((request, i) => (
                        <motion.div
                          key={request.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="p-4 sm:p-6 bg-white/[0.02] rounded-xl border border-white/10 hover:border-white/20 transition-all"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-xs text-gray-500">Wallet:</span>
                                <code className="text-sm font-mono bg-black/30 px-2 py-1 rounded truncate max-w-[200px] sm:max-w-none">
                                  {request.walletPubkey}
                                </code>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>ID: {request.id.slice(0, 8)}...</span>
                                <span>•</span>
                                <span>{timeAgo(request.requestedAt)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {request.zassportData?.isValid && (
                                <span className="badge badge-success">✓ Zassport</span>
                              )}
                              {request.zassportData?.isAdult && (
                                <span className="badge badge-info">18+</span>
                              )}
                              {request.zassportData?.nationality && (
                                <span className="badge badge-purple">{request.zassportData.nationality}</span>
                              )}
                            </div>
                          </div>

                          {/* Zassport Details */}
                          {request.zassportPDA && (
                            <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-medium text-blue-400">🛂 Zassport Identity</h4>
                                {request.nullifier && (
                                  <span className="badge badge-success text-[10px]">🔒 Unique Identity</span>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">PDA:</span>
                                  <code className="ml-2 font-mono text-emerald-400 break-all">
                                    {request.zassportPDA.slice(0, 22)}...
                                  </code>
                                </div>
                                {request.nullifier && (
                                  <div>
                                    <span className="text-gray-500">Nullifier (Sybil ID):</span>
                                    <code className="ml-2 font-mono text-amber-400 break-all">
                                      {request.nullifier.slice(0, 16)}...
                                    </code>
                                  </div>
                                )}
                              </div>
                              {request.commitment && (
                                <div className="mt-2 text-xs">
                                  <span className="text-gray-500">Commitment:</span>
                                  <code className="ml-2 font-mono text-purple-400 break-all">
                                    {request.commitment.slice(0, 16)}...
                                  </code>
                                </div>
                              )}
                              {request.zassportData?.verifiedAt && request.zassportData.verifiedAt > 0 && (
                                <p className="text-xs text-gray-500 mt-2">
                                  Verified: {request.zassportData.verifiedAt > 4102444800 
                                    ? 'Active' 
                                    : new Date(request.zassportData.verifiedAt * 1000).toLocaleString()}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row gap-3">
                            <button
                              onClick={() => handleApprove(request)}
                              disabled={isLoading && processingId === request.id}
                              className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-medium 
                                       hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-50 disabled:cursor-wait"
                            >
                              {isLoading && processingId === request.id ? (
                                <span className="flex items-center justify-center gap-2">
                                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Processing...
                                </span>
                              ) : (
                                '✅ Approve & Register On-Chain'
                              )}
                            </button>
                            <button
                              onClick={() => handleReject(request)}
                              disabled={isLoading && processingId === request.id}
                              className="flex-1 sm:flex-none py-3 px-6 bg-red-500/20 text-red-400 rounded-xl font-medium 
                                       hover:bg-red-500/30 transition-all border border-red-500/30"
                            >
                              ❌ Reject
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* APPROVED TAB */}
            {activeTab === 'approved' && (
              <motion.div
                key="approved"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="glass-card p-6 sm:p-8">
                  <h2 className="text-xl sm:text-2xl font-bold mb-6">Approved Registrations</h2>

                  {approvedRequests.length === 0 ? (
                    <div className="text-center py-16">
                      <span className="text-6xl mb-4 block">📋</span>
                      <h3 className="text-xl font-semibold mb-2">No Approved Registrations Yet</h3>
                      <p className="text-gray-400">Approved requests will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {approvedRequests.map((request, i) => (
                        <motion.div
                          key={request.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="p-4 bg-white/[0.02] rounded-xl border border-emerald-500/20 flex items-center justify-between"
                        >
                          <div>
                            <code className="text-sm font-mono">{request.walletPubkey.slice(0, 20)}...</code>
                            <p className="text-xs text-gray-500 mt-1">{timeAgo(request.requestedAt)}</p>
                          </div>
                          <span className="badge badge-success">Approved</span>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* CITIZENS TAB */}
            {activeTab === 'citizens' && (
              <motion.div
                key="citizens"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="glass-card p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold">All Citizens</h2>
                      <p className="text-gray-400 text-sm">
                        {citizens.length} citizens in the Merkle tree
                      </p>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search by commitment or index..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input-field pl-10 text-sm w-full sm:w-64"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                    </div>
                  </div>

                  {filteredCitizens.length === 0 ? (
                    <div className="text-center py-16">
                      <span className="text-6xl mb-4 block">👥</span>
                      <h3 className="text-xl font-semibold mb-2">
                        {searchQuery ? 'No Results Found' : 'No Citizens Yet'}
                      </h3>
                      <p className="text-gray-400">
                        {searchQuery ? 'Try a different search term' : 'Registered citizens will appear here'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Index</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Commitment</th>
                            <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase hidden sm:table-cell">Registered</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCitizens.map((citizen, i) => (
                            <motion.tr
                              key={citizen.commitment}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.02 }}
                              className="border-b border-white/5 hover:bg-white/[0.02]"
                            >
                              <td className="py-3 px-4">
                                <span className="font-mono text-emerald-400">#{citizen.leafIndex}</span>
                              </td>
                              <td className="py-3 px-4">
                                <code className="text-xs bg-black/30 px-2 py-1 rounded">
                                  {citizen.commitment.slice(0, 20)}...
                                </code>
                              </td>
                              <td className="py-3 px-4 text-sm text-gray-400 hidden sm:table-cell">
                                {citizen.registeredAt ? timeAgo(citizen.registeredAt) : '-'}
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* STATS TAB */}
            {activeTab === 'stats' && (
              <motion.div
                key="stats"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Merkle Tree Stats */}
                  <div className="glass-card p-6 sm:p-8">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <span>🌳</span>
                      Merkle Tree
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-3 border-b border-white/5">
                        <span className="text-gray-400">Total Leaves</span>
                        <span className="font-mono text-xl">{treeStats?.leafCount || 0}</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-white/5">
                        <span className="text-gray-400">Tree Depth</span>
                        <span className="font-mono text-xl">{treeStats?.depth || 20}</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-white/5">
                        <span className="text-gray-400">Max Capacity</span>
                        <span className="font-mono text-xl">1,048,576</span>
                      </div>
                      <div className="flex justify-between items-center py-3">
                        <span className="text-gray-400">Utilization</span>
                        <span className="font-mono text-xl">
                          {((treeStats?.leafCount || 0) / 1048576 * 100).toFixed(4)}%
                        </span>
                      </div>
                      <div className="mt-4">
                        <div className="progress-bar">
                          <div 
                            className="progress-bar-fill" 
                            style={{ width: `${Math.max(0.1, (treeStats?.leafCount || 0) / 1048576 * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-xs text-gray-400 mb-2">Current Root</p>
                        <code className="text-xs text-emerald-400 break-all block bg-black/30 p-3 rounded-lg">
                          {treeStats?.merkleRoot || '---'}
                        </code>
                      </div>
                      <button
                        onClick={handleSyncRoot}
                        disabled={isLoading}
                        className="w-full btn-primary mt-4"
                      >
                        {isLoading ? '⏳ Syncing...' : '🔄 Sync Root On-Chain'}
                      </button>
                    </div>
                  </div>

                  {/* Registration Queue Stats */}
                  <div className="glass-card p-6 sm:p-8">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <span>📝</span>
                      Registration Queue
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-3 border-b border-white/5">
                        <span className="text-gray-400">Total Requests</span>
                        <span className="font-mono text-xl">{regStats?.total || 0}</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-white/5">
                        <span className="text-amber-400">Pending</span>
                        <span className="font-mono text-xl text-amber-400">{regStats?.pending || 0}</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-white/5">
                        <span className="text-emerald-400">Approved</span>
                        <span className="font-mono text-xl text-emerald-400">{regStats?.approved || 0}</span>
                      </div>
                      <div className="flex justify-between items-center py-3">
                        <span className="text-red-400">Rejected</span>
                        <span className="font-mono text-xl text-red-400">{regStats?.rejected || 0}</span>
                      </div>
                    </div>

                    {/* Pie chart visual */}
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <div className="flex items-center justify-center gap-6">
                        {[
                          { label: 'Approved', value: regStats?.approved || 0, color: 'bg-emerald-500' },
                          { label: 'Pending', value: regStats?.pending || 0, color: 'bg-amber-500' },
                          { label: 'Rejected', value: regStats?.rejected || 0, color: 'bg-red-500' },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${item.color}`} />
                            <span className="text-sm text-gray-400">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* System Info */}
                <div className="glass-card p-6 sm:p-8">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <span>⚙️</span>
                    System Information
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Program ID', value: '9TNby...bnBG', icon: '📜' },
                      { label: 'Network', value: 'Devnet', icon: '🌐' },
                      { label: 'Indexer', value: 'Port 4000', icon: '📊' },
                      { label: 'Verifier', value: 'Port 3001', icon: '🔐' },
                    ].map((item) => (
                      <div key={item.label} className="p-4 bg-black/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <span>{item.icon}</span>
                          <span className="text-sm text-gray-400">{item.label}</span>
                        </div>
                        <p className="font-mono text-sm">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <ToastContainer toasts={toast.toasts} onClose={toast.dismiss} />
      </div>
    </>
  );
}
