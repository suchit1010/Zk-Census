import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { useMemo, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Default styles for wallet adapter
import '@solana/wallet-adapter-react-ui/styles.css';

// Dynamically import wallet components to avoid SSR issues
const WalletContextProvider = dynamic(
  () => import('@/components/WalletContextProvider'),
  { ssr: false }
);

export default function App({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show nothing on server, show app on client
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading ZK Census...</div>
      </div>
    );
  }

  return (
    <WalletContextProvider>
      <Component {...pageProps} />
    </WalletContextProvider>
  );
}
