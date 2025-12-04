import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';

// Scans recent transactions for the census program and extracts any CitizenRegistered logs
// Usage: npx ts-node scripts/export-commitments.ts

const PROGRAM_ID = new PublicKey('9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH');
const RPC = 'https://api.devnet.solana.com';
const LIMIT = 1000; // adjust as needed

async function main() {
  const conn = new Connection(RPC, 'confirmed');

  console.log('🔎 Fetching recent signatures for program...');
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: LIMIT });
  console.log(`Found ${sigs.length} signatures`);

  const commitments: Array<{commitmentHex:string, leafIndex:number, sig:string}> = [];

  for (let i = 0; i < sigs.length; i++) {
    const sig = sigs[i].signature;
    try {
      const tx = await conn.getTransaction(sig, { commitment: 'confirmed' });
      if (!tx || !tx.meta) continue;
      const logs = tx.meta.logMessages || [];

      // Search logs for the human-readable registration lines emitted by the program
      // e.g. "✅ Citizen registered to Merkle tree!" and later logs with Leaf index
      // The event emitted by Anchor may be base64 encoded; we attempt to find readable lines first.
      for (const l of logs) {
        if (l.includes('CitizenRegistered') || l.includes('Citizen registered to Merkle tree') || l.includes('commitment')) {
          // Try to extract hex-looking substrings from the log
          const hexMatches = Array.from(l.matchAll(/([0-9a-f]{64,64})/ig)).map(m => m[1]);
          if (hexMatches.length) {
            const commitmentHex = hexMatches[0];
            // try to find leaf index in same tx logs
            const idxLine = logs.find(x => x.toLowerCase().includes('leaf index') || x.toLowerCase().includes('leaf_index'));
            let leafIdx = 0;
            if (idxLine) {
              const m = idxLine.match(/(\d+)/);
              if (m) leafIdx = parseInt(m[1], 10);
            }
            commitments.push({ commitmentHex, leafIndex: leafIdx, sig });
            console.log(`  → ${sig} commitment ${commitmentHex.slice(0,16)}... leaf ${leafIdx}`);
          }
        }

        // Try to decode Anchor-style base64 events (pattern may vary)
        const eventMatch = l.match(/EVENT: (.*)$/i) || l.match(/Program data: (.*)$/i);
        if (eventMatch) {
          const b64 = eventMatch[1].trim();
          try {
            const buf = Buffer.from(b64, 'base64');
            // naive attempt: search for 32-byte sequences inside buf and print hex
            for (let j = 0; j + 32 <= buf.length; j++) {
              const candidate = buf.slice(j, j + 32);
              // Heuristic: not all zeros
              if (candidate.some(v => v !== 0)) {
                const hex = candidate.toString('hex');
                commitments.push({ commitmentHex: hex, leafIndex: 0, sig });
                console.log(`  → ${sig} decoded event commitment ${hex.slice(0,16)}...`);
                break;
              }
            }
          } catch (e) {
            // ignore decode failures
          }
        }
      }
    } catch (e) {
      // ignore per-tx failures
    }
  }

  // Remove duplicates by commitmentHex
  const uniq = new Map<string, {commitmentHex:string, leafIndex:number, sig:string}>();
  for (const c of commitments) {
    uniq.set(c.commitmentHex, c);
  }

  const out = Array.from(uniq.values());
  console.log(`\n✅ Extracted ${out.length} unique commitments (best-effort). Writing commitments.json`);
  fs.writeFileSync('commitments.json', JSON.stringify(out, null, 2));
  console.log('commitments.json written');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});