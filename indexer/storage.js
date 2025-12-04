import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const TREE_FILE = path.join(DATA_DIR, 'tree.json');
const CITIZENS_FILE = path.join(DATA_DIR, 'citizens.json');

export class Storage {
  static async initialize() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    // Create empty files if they don't exist
    try {
      await fs.access(TREE_FILE);
    } catch {
      await fs.writeFile(TREE_FILE, JSON.stringify({ leaves: [], levels: 20 }));
    }
    
    try {
      await fs.access(CITIZENS_FILE);
    } catch {
      await fs.writeFile(CITIZENS_FILE, JSON.stringify([]));
    }
  }

  static async saveTree(treeData) {
    // Handle both tree instances (with toJSON) and plain objects
    const data = typeof treeData.toJSON === 'function' 
      ? treeData.toJSON() 
      : treeData;
    await fs.writeFile(TREE_FILE, JSON.stringify(data, null, 2));
  }

  static async loadTree() {
    const data = await fs.readFile(TREE_FILE, 'utf-8');
    return JSON.parse(data);
  }

  static async saveCitizen(citizen) {
    const citizens = await this.loadCitizens();
    citizens.push(citizen);
    await fs.writeFile(CITIZENS_FILE, JSON.stringify(citizens, null, 2));
  }

  static async loadCitizens() {
    const data = await fs.readFile(CITIZENS_FILE, 'utf-8');
    return JSON.parse(data);
  }

  static async getCitizenByCommitment(commitment) {
    const citizens = await this.loadCitizens();
    return citizens.find(c => c.commitment === commitment);
  }

  static async getCitizenByIndex(index) {
    const citizens = await this.loadCitizens();
    return citizens[index];
  }
}
