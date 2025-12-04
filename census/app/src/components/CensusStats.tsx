import { useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';

interface CensusStatsProps {
  population: number;
  onUpdate: (population: number) => void;
}

export function CensusStats({ population, onUpdate }: CensusStatsProps) {
  const { connection } = useConnection();
  const [scope, setScope] = useState(1);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // TODO: Fetch actual census state from program
        // const censusState = await program.account.censusState.fetch(censusStatePda);
        // onUpdate(censusState.currentPopulation);
        // setScope(censusState.currentScope);
        // setTotalRegistered(censusState.totalRegistered);
        
        // Mock data for demo
        setLoading(false);
        setTotalRegistered(1247);
      } catch (err) {
        console.error('Failed to fetch census stats:', err);
        setLoading(false);
      }
    }

    fetchStats();
    
    // Subscribe to census events for real-time updates
    // const subscriptionId = connection.onProgramAccountChange(...)
    
  }, [connection, onUpdate]);

  return (
    <div className="glass-card p-8 text-center">
      {/* Main Population Counter */}
      <div className="mb-6">
        <p className="text-sm text-gray-400 uppercase tracking-wide mb-2">
          Week {scope} Population
        </p>
        <div className="text-7xl font-bold text-solarpunk-light mb-2 font-mono">
          {loading ? (
            <span className="animate-pulse">---</span>
          ) : (
            population.toLocaleString()
          )}
        </div>
        <p className="text-gray-400">
          unique citizens verified this week
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10">
        <div>
          <p className="text-2xl font-bold text-solarpunk-accent font-mono">
            {totalRegistered.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400">Total Registered</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-solarpunk-accent font-mono">
            {loading ? '-' : ((population / totalRegistered) * 100).toFixed(1)}%
          </p>
          <p className="text-xs text-gray-400">Participation Rate</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-solarpunk-accent font-mono">
            $0.00005
          </p>
          <p className="text-xs text-gray-400">Per Proof</p>
        </div>
      </div>

      {/* Privacy Badge */}
      <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-solarpunk-primary/20 rounded-full text-sm">
        <span className="w-2 h-2 bg-green-400 rounded-full pulse-animation"></span>
        <span className="text-solarpunk-light">Zero-Knowledge Verified</span>
      </div>
    </div>
  );
}
