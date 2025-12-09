import React, { useEffect, useState } from 'react';

const DebugBackends = () => {
  const [apiStatus, setApiStatus] = useState<any>(null);
  const [clientIndexer, setClientIndexer] = useState('');
  const [clientVerifier, setClientVerifier] = useState('');
  const [clientIndexerHealth, setClientIndexerHealth] = useState<any>(null);
  const [clientVerifierHealth, setClientVerifierHealth] = useState<any>(null);

  useEffect(() => {
    setClientIndexer(process.env.NEXT_PUBLIC_INDEXER_API_URL || 'unset');
    setClientVerifier(process.env.NEXT_PUBLIC_VERIFIER_API_URL || 'unset');
    fetch('/api/_status').then(r => r.json()).then(setApiStatus);
    // Client-side fetches
    if (process.env.NEXT_PUBLIC_INDEXER_API_URL) {
      fetch(`${process.env.NEXT_PUBLIC_INDEXER_API_URL}/health`).then(r => r.json()).then(setClientIndexerHealth).catch(e => setClientIndexerHealth({ error: e.message }));
    }
    if (process.env.NEXT_PUBLIC_VERIFIER_API_URL) {
      fetch(`${process.env.NEXT_PUBLIC_VERIFIER_API_URL}/health`).then(r => r.json()).then(setClientVerifierHealth).catch(e => setClientVerifierHealth({ error: e.message }));
    }
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: 'monospace', background: '#181c24', color: '#fff', minHeight: '100vh' }}>
      <h1>Backend Debug Status</h1>
      <h2>Server-side (API route)</h2>
      <pre>{JSON.stringify(apiStatus, null, 2)}</pre>
      <h2>Client-side (browser env)</h2>
      <div>process.env.NEXT_PUBLIC_INDEXER_API_URL: <b>{clientIndexer}</b></div>
      <div>process.env.NEXT_PUBLIC_VERIFIER_API_URL: <b>{clientVerifier}</b></div>
      <h3>Client fetch: Indexer /health</h3>
      <pre>{JSON.stringify(clientIndexerHealth, null, 2)}</pre>
      <h3>Client fetch: Verifier /health</h3>
      <pre>{JSON.stringify(clientVerifierHealth, null, 2)}</pre>
    </div>
  );
};

export default DebugBackends;
