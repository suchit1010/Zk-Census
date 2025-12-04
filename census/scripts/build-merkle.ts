import * as fs from 'fs';
import { buildPoseidon } from 'circomlibjs';

// Build a Poseidon Merkle tree from commitments.json
// Usage: npx ts-node scripts/build-merkle.ts [leafIndex]

async function main() {
  if (!fs.existsSync('commitments.json')) {
    console.error('commitments.json not found. Run export-commitments.ts first.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync('commitments.json','utf-8'));
  const commitmentsHex: string[] = data.map((x:any) => x.commitmentHex);

  const TREE_DEPTH = 20;
  const ZERO = '0'.repeat(64);

  // Pad to power-of-two leaves if necessary (we'll fill with zeros)
  const leaves: bigint[] = [];

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  for (let i=0;i<commitmentsHex.length;i++){
    const hex = commitmentsHex[i];
    // convert hex to BigInt
    const b = BigInt('0x' + hex);
    leaves.push(b);
  }

  const totalLeaves = 1 << TREE_DEPTH;
  while (leaves.length < totalLeaves) {
    leaves.push(BigInt(0));
  }

  // Compute tree up to root using poseidon
  const levels: bigint[][] = [];
  levels[0] = leaves;
  for (let d = 1; d <= TREE_DEPTH; d++) {
    const upper: bigint[] = [];
    const lower = levels[d-1];
    for (let i = 0; i < lower.length; i += 2) {
      const left = lower[i];
      const right = lower[i+1];
      const h = F.toString(poseidon([left, right]));
      // poseidon returns BigInt-like via F; parse to bigint
      const hBig = BigInt(h);
      upper.push(hBig);
    }
    levels[d] = upper;
  }

  const root = levels[TREE_DEPTH][0];
  const rootHex = root.toString(16).padStart(64, '0');
  console.log('\n✅ Computed Merkle root (hex):', rootHex);

  // If leafIndex arg passed, compute sibling path
  const leafIndexArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  if (leafIndexArg !== null) {
    const idx = leafIndexArg;
    const siblings: string[] = [];
    let nodeIndex = idx;
    for (let d = 0; d < TREE_DEPTH; d++) {
      const level = levels[d];
      const pairIndex = nodeIndex ^ 1;
      const sib = level[pairIndex];
      siblings.push(sib.toString(16).padStart(64, '0'));
      nodeIndex = Math.floor(nodeIndex / 2);
    }
    console.log('\n🔐 Sibling path for leaf', idx, ':');
    siblings.forEach((s, i) => console.log(`  [${i}] ${s}`));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});