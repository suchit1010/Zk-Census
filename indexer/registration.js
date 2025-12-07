import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Connection, PublicKey } from '@solana/web3.js';
import { buildPoseidon } from 'circomlibjs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const REQUESTS_FILE = path.join(DATA_DIR, 'registration_requests.json');

// Initialize Poseidon for identity derivation
let poseidon = null;

async function initPoseidon() {
  if (!poseidon) {
    poseidon = await buildPoseidon();
  }
  return poseidon;
}

// Zassport Program ID (placeholder - replace with actual when available)
// Using a valid base58 string for now
const ZASSPORT_PROGRAM_ID_STRING = '11111111111111111111111111111111';
const FIELD_PRIME = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

/**
 * Registration Request Status
 */
const RequestStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

/**
 * Registration Request Structure
 */
class RegistrationRequest {
  constructor({
    id,
    walletPubkey,
    zassportPDA,
    zassportData,
    requestedAt,
    status,
    processedAt,
    processedBy,
    rejectionReason,
    identityCommitment,
    leafIndex
  }) {
    this.id = id;
    this.walletPubkey = walletPubkey;
    this.zassportPDA = zassportPDA;
    this.zassportData = zassportData;
    this.requestedAt = requestedAt;
    this.status = status || RequestStatus.PENDING;
    this.processedAt = processedAt;
    this.processedBy = processedBy;
    this.rejectionReason = rejectionReason;
    this.identityCommitment = identityCommitment;
    this.leafIndex = leafIndex;
  }
}

/**
 * Registration Queue Manager
 */
export class RegistrationQueue {
  /**
   * Initialize storage
   */
  static async initialize() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    try {
      await fs.access(REQUESTS_FILE);
    } catch {
      await fs.writeFile(REQUESTS_FILE, JSON.stringify([]));
    }
  }

  /**
   * Load all requests
   */
  static async loadRequests() {
    try {
      const data = await fs.readFile(REQUESTS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Save all requests
   */
  static async saveRequests(requests) {
    await fs.writeFile(REQUESTS_FILE, JSON.stringify(requests, null, 2));
  }

  /**
   * Generate unique request ID
   */
  static generateRequestId() {
    return `REQ-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Create a new registration request
   */
  static async createRequest(walletPubkey, zassportPDA, zassportData) {
    const requests = await this.loadRequests();
    
    // Check for duplicate requests
    const existing = requests.find(r => 
      r.walletPubkey === walletPubkey && 
      r.status === RequestStatus.PENDING
    );
    
    if (existing) {
      throw new Error('Pending request already exists for this wallet');
    }
    
    // Check if already approved - return existing registration info
    const approved = requests.find(r => 
      r.walletPubkey === walletPubkey && 
      r.status === RequestStatus.APPROVED
    );
    
    if (approved) {
      // Return the existing approved request instead of throwing
      const error = new Error('Wallet is already registered');
      error.existingRequest = approved;
      throw error;
    }
    
    const request = new RegistrationRequest({
      id: this.generateRequestId(),
      walletPubkey,
      zassportPDA,
      zassportData,
      requestedAt: Date.now(),
      status: RequestStatus.PENDING
    });
    
    requests.push(request);
    await this.saveRequests(requests);
    
    return request;
  }

  /**
   * Get pending requests (admin)
   */
  static async getPendingRequests() {
    const requests = await this.loadRequests();
    return requests.filter(r => r.status === RequestStatus.PENDING);
  }

  /**
   * Get request by ID
   */
  static async getRequestById(id) {
    const requests = await this.loadRequests();
    return requests.find(r => r.id === id);
  }

  /**
   * Get request by wallet
   */
  static async getRequestByWallet(walletPubkey) {
    const requests = await this.loadRequests();
    return requests.find(r => r.walletPubkey === walletPubkey);
  }

  /**
   * Approve request (admin)
   */
  static async approveRequest(requestId, adminPubkey, identityCommitment, leafIndex, credentials = null) {
    const requests = await this.loadRequests();
    const index = requests.findIndex(r => r.id === requestId);
    
    if (index === -1) {
      throw new Error('Request not found');
    }
    
    if (requests[index].status !== RequestStatus.PENDING) {
      throw new Error('Request is not pending');
    }
    
    requests[index].status = RequestStatus.APPROVED;
    requests[index].processedAt = Date.now();
    requests[index].processedBy = adminPubkey;
    requests[index].identityCommitment = identityCommitment;
    requests[index].leafIndex = leafIndex;
    
    // Save credentials if provided
    if (credentials) {
      requests[index].credentials = credentials;
    }
    
    await this.saveRequests(requests);
    
    return requests[index];
  }

  /**
   * Reject request (admin)
   */
  static async rejectRequest(requestId, adminPubkey, reason) {
    const requests = await this.loadRequests();
    const index = requests.findIndex(r => r.id === requestId);
    
    if (index === -1) {
      throw new Error('Request not found');
    }
    
    if (requests[index].status !== RequestStatus.PENDING) {
      throw new Error('Request is not pending');
    }
    
    requests[index].status = RequestStatus.REJECTED;
    requests[index].processedAt = Date.now();
    requests[index].processedBy = adminPubkey;
    requests[index].rejectionReason = reason;
    
    await this.saveRequests(requests);
    
    return requests[index];
  }

  /**
   * Get all approved registrations
   */
  static async getApprovedRegistrations() {
    const requests = await this.loadRequests();
    return requests.filter(r => r.status === RequestStatus.APPROVED);
  }

  /**
   * Get statistics
   */
  static async getStats() {
    const requests = await this.loadRequests();
    return {
      total: requests.length,
      pending: requests.filter(r => r.status === RequestStatus.PENDING).length,
      approved: requests.filter(r => r.status === RequestStatus.APPROVED).length,
      rejected: requests.filter(r => r.status === RequestStatus.REJECTED).length
    };
  }
}

/**
 * Zassport Attestation Verifier
 */
export class ZassportVerifier {
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Derive Zassport attestation PDA (when real Zassport program is available)
   */
  static deriveZassportPDA(walletPubkey, passportHash) {
    const ZASSPORT_PROGRAM_ID = new PublicKey(ZASSPORT_PROGRAM_ID_STRING);
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('zassport'),
        new PublicKey(walletPubkey).toBuffer(),
        Buffer.from(passportHash, 'hex')
      ],
      ZASSPORT_PROGRAM_ID
    );
  }

  /**
   * Fetch and verify Zassport attestation
   */
  async verifyAttestation(walletPubkey) {
    try {
      // In production: Query Solana for Zassport PDAs associated with this wallet
      // For now, simulate the verification
      
      // Mock attestation data (replace with actual PDA fetch)
      const mockAttestation = {
        exists: true,
        pda: 'ZASSPxxxMockPDAAddressxxxxxxxxxxxxxxxxxxx',
        isValid: true,
        isAdult: true,
        nationality: 'USA',
        verifiedAt: Date.now() - 86400000, // 1 day ago
        expiresAt: Date.now() + 86400000 * 365, // 1 year from now
        passportHash: crypto.randomBytes(32).toString('hex')
      };
      
      // Validation checks
      const now = Date.now();
      
      if (!mockAttestation.exists) {
        return {
          eligible: false,
          reason: 'No Zassport attestation found for this wallet',
          attestation: null
        };
      }
      
      if (!mockAttestation.isValid) {
        return {
          eligible: false,
          reason: 'Zassport attestation is not valid',
          attestation: mockAttestation
        };
      }
      
      if (!mockAttestation.isAdult) {
        return {
          eligible: false,
          reason: 'User must be 18+ to participate in census',
          attestation: mockAttestation
        };
      }
      
      if (mockAttestation.expiresAt < now) {
        return {
          eligible: false,
          reason: 'Zassport attestation has expired',
          attestation: mockAttestation
        };
      }
      
      return {
        eligible: true,
        reason: null,
        attestation: mockAttestation
      };
      
    } catch (error) {
      return {
        eligible: false,
        reason: `Verification error: ${error.message}`,
        attestation: null
      };
    }
  }
}

/**
 * Identity Generator (Sybil-resistant)
 */
export class IdentityGenerator {
  constructor(adminSalt) {
    this.adminSalt = adminSalt || crypto.randomBytes(32).toString('hex');
  }

  /**
   * Derive identity from Zassport attestation
   * 
   * nullifier = Poseidon(passportHash, walletPubkey, adminSalt)
   * trapdoor = random()
   * commitment = Poseidon(nullifier, trapdoor)
   */
  async generateIdentity(walletPubkey, passportHash) {
    const poseidonFn = await initPoseidon();
    
    // Convert inputs to BigInt for Poseidon
    const walletBytes = Buffer.from(new PublicKey(walletPubkey).toBytes());
    const passportBytes = Buffer.from(passportHash, 'hex');
    const saltBytes = Buffer.from(this.adminSalt, 'hex');
    
    // Derive nullifier deterministically from passport + wallet + salt
    // This ensures one passport = one identity
    const combinedBytes = Buffer.concat([passportBytes, walletBytes, saltBytes]);
    const combinedHash = crypto.createHash('sha256').update(combinedBytes).digest();
    const identityNullifier = BigInt('0x' + combinedHash.toString('hex')) % FIELD_PRIME;
    
    // Generate random trapdoor
    const trapdoorBytes = crypto.randomBytes(32);
    const identityTrapdoor = BigInt('0x' + trapdoorBytes.toString('hex')) % FIELD_PRIME;
    
    // Compute commitment = Poseidon(nullifier, trapdoor)
    const commitmentHash = poseidonFn([identityNullifier, identityTrapdoor]);
    const commitment = BigInt(poseidonFn.F.toString(commitmentHash));
    
    // Convert commitment to 32-byte array
    const commitmentBytes = new Uint8Array(32);
    let temp = commitment;
    for (let i = 0; i < 32; i++) {
      commitmentBytes[i] = Number(temp & 0xFFn);
      temp >>= 8n;
    }
    
    return {
      identityNullifier: identityNullifier.toString(),
      identityTrapdoor: identityTrapdoor.toString(),
      commitment: commitment.toString(),
      commitmentBytes: Array.from(commitmentBytes)
    };
  }

  /**
   * Encrypt credentials for delivery to user
   */
  encryptCredentials(credentials, userPublicKey) {
    // In production: Use asymmetric encryption with user's public key
    // For now, use simple encryption with user's wallet as key
    const key = crypto.createHash('sha256')
      .update(userPublicKey)
      .digest();
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    const data = JSON.stringify(credentials);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted,
      iv: iv.toString('hex')
    };
  }

  /**
   * Decrypt credentials (for user)
   */
  static decryptCredentials(encryptedData, iv, userPublicKey) {
    const key = crypto.createHash('sha256')
      .update(userPublicKey)
      .digest();
    
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc', 
      key, 
      Buffer.from(iv, 'hex')
    );
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }
}

export { RequestStatus };
