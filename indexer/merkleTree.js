import { buildPoseidon } from 'circomlibjs';

const TREE_LEVELS = 20;

export class IncrementalMerkleTree {
  constructor() {
    this.leaves = [];
    this.levels = TREE_LEVELS;
    this.poseidon = null;
    this.zeros = [];
  }

  async initialize() {
    this.poseidon = await buildPoseidon();
    
    // Compute zero values for each level
    let currentZero = 0n;
    this.zeros = [currentZero];
    
    for (let i = 0; i < this.levels; i++) {
      currentZero = this.hash(currentZero, currentZero);
      this.zeros.push(currentZero);
    }
  }

  hash(left, right) {
    const hash = this.poseidon([left, right]);
    return this.poseidon.F.toString(hash);
  }

  insert(leaf) {
    const leafIndex = this.leaves.length;
    this.leaves.push(BigInt(leaf));
    return leafIndex;
  }

  getRoot() {
    if (this.leaves.length === 0) {
      return this.zeros[this.levels];
    }

    const nodes = [...this.leaves];
    
    for (let level = 0; level < this.levels; level++) {
      const levelSize = Math.ceil(nodes.length / 2);
      const nextLevel = [];
      
      for (let i = 0; i < levelSize; i++) {
        const left = nodes[2 * i] !== undefined ? nodes[2 * i] : this.zeros[level];
        const right = nodes[2 * i + 1] !== undefined ? nodes[2 * i + 1] : this.zeros[level];
        nextLevel.push(BigInt(this.hash(left, right)));
      }
      
      nodes.splice(0, nodes.length, ...nextLevel);
    }

    return nodes[0].toString();
  }

  getMerkleProof(leafIndex) {
    if (leafIndex >= this.leaves.length) {
      throw new Error('Leaf index out of bounds');
    }

    const pathElements = [];
    const pathIndices = [];
    let currentIndex = leafIndex;
    const nodes = [...this.leaves];

    for (let level = 0; level < this.levels; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
      
      let sibling;
      if (siblingIndex < nodes.length) {
        sibling = nodes[siblingIndex];
      } else {
        sibling = this.zeros[level];
      }
      
      pathElements.push(sibling.toString());
      pathIndices.push(isLeft ? 0 : 1);
      
      // Move to next level
      const levelSize = Math.ceil(nodes.length / 2);
      const nextLevel = [];
      
      for (let i = 0; i < levelSize; i++) {
        const left = nodes[2 * i] !== undefined ? nodes[2 * i] : this.zeros[level];
        const right = nodes[2 * i + 1] !== undefined ? nodes[2 * i + 1] : this.zeros[level];
        nextLevel.push(BigInt(this.hash(left, right)));
      }
      
      nodes.splice(0, nodes.length, ...nextLevel);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      pathElements,
      pathIndices,
      root: this.getRoot(),
      leaf: this.leaves[leafIndex].toString()
    };
  }

  toJSON() {
    return {
      leaves: this.leaves.map(l => l.toString()),
      levels: this.levels,
      root: this.getRoot()
    };
  }

  static async fromJSON(data) {
    const tree = new IncrementalMerkleTree();
    await tree.initialize();
    tree.leaves = data.leaves.map(l => BigInt(l));
    tree.levels = data.levels;
    return tree;
  }
}
