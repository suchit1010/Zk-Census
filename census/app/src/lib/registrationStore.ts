/**
 * Registration Store
 * 
 * In-memory store for registration requests.
 * In production, this should use a database like Redis or PostgreSQL.
 * 
 * This implements the registration queue with admin approval workflow.
 */

export interface RegistrationRequest {
  id: string;
  walletPubkey: string;
  zassportCommitment?: string;
  zassportNullifier?: string;
  zassportPDA?: string;
  zassportData?: {
    ageVerified: boolean;
    nationalityVerified: boolean;
    nationality?: number;
  };
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: number;
  processedAt?: number;
  processedBy?: string;
  rejectionReason?: string;
  credentials?: {
    identityNullifier: string;
    identityTrapdoor: string;
    identityCommitment: string;
  };
  leafIndex?: number;
}

interface RegistrationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

class RegistrationStore {
  private requests: Map<string, RegistrationRequest> = new Map();
  private walletToRequest: Map<string, string> = new Map();
  private nullifierToRequest: Map<string, string> = new Map();

  constructor() {
    // Initialize with any stored data (in production, load from DB)
    console.log('📋 Registration store initialized');
  }

  /**
   * Create a new registration request
   */
  createRequest(data: {
    walletPubkey: string;
    zassportCommitment?: string;
    zassportNullifier?: string;
    zassportPDA?: string;
    zassportData?: {
      ageVerified: boolean;
      nationalityVerified: boolean;
      nationality?: number;
    };
  }): RegistrationRequest {
    // Check if wallet already has a request
    const existingId = this.walletToRequest.get(data.walletPubkey);
    if (existingId) {
      const existing = this.requests.get(existingId);
      if (existing && existing.status === 'rejected') {
        // Allow resubmission by updating the rejected request
        existing.status = 'pending';
        existing.requestedAt = Date.now();
        existing.rejectionReason = undefined;
        existing.processedAt = undefined;
        existing.zassportCommitment = data.zassportCommitment;
        existing.zassportNullifier = data.zassportNullifier;
        existing.zassportData = data.zassportData;
        return existing;
      }
      if (existing) {
        return existing;
      }
    }

    const id = this.generateId();
    const request: RegistrationRequest = {
      id,
      walletPubkey: data.walletPubkey,
      zassportCommitment: data.zassportCommitment,
      zassportNullifier: data.zassportNullifier,
      zassportPDA: data.zassportPDA,
      zassportData: data.zassportData,
      status: 'pending',
      requestedAt: Date.now(),
    };

    this.requests.set(id, request);
    this.walletToRequest.set(data.walletPubkey, id);
    
    if (data.zassportNullifier) {
      this.nullifierToRequest.set(data.zassportNullifier, id);
    }

    console.log(`📝 New registration request: ${id} for wallet ${data.walletPubkey.slice(0, 8)}...`);
    return request;
  }

  /**
   * Get request by ID
   */
  getRequestById(id: string): RegistrationRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * Get request by wallet
   */
  getRequestByWallet(wallet: string): RegistrationRequest | undefined {
    const id = this.walletToRequest.get(wallet);
    if (id) {
      return this.requests.get(id);
    }
    return undefined;
  }

  /**
   * Get request by Zassport nullifier (for Sybil check)
   */
  getRequestByNullifier(nullifier: string): RegistrationRequest | undefined {
    const id = this.nullifierToRequest.get(nullifier);
    if (id) {
      return this.requests.get(id);
    }
    return undefined;
  }

  /**
   * Check if nullifier is already used with a different wallet
   */
  checkDuplicateNullifier(nullifier: string | undefined, wallet: string): {
    isDuplicate: boolean;
    existingWallet?: string;
  } {
    if (!nullifier) {
      return { isDuplicate: false };
    }

    const existingId = this.nullifierToRequest.get(nullifier);
    if (!existingId) {
      return { isDuplicate: false };
    }

    const existing = this.requests.get(existingId);
    if (!existing) {
      return { isDuplicate: false };
    }

    // Only flag as duplicate if it's a different wallet AND the request was approved
    if (existing.walletPubkey !== wallet && existing.status === 'approved') {
      return {
        isDuplicate: true,
        existingWallet: existing.walletPubkey,
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Approve a request
   */
  approveRequest(id: string, data: {
    credentials: {
      identityNullifier: string;
      identityTrapdoor: string;
      identityCommitment: string;
    };
    leafIndex: number;
    processedBy?: string;
  }): RegistrationRequest | null {
    const request = this.requests.get(id);
    if (!request || request.status !== 'pending') {
      return null;
    }

    request.status = 'approved';
    request.processedAt = Date.now();
    request.processedBy = data.processedBy;
    request.credentials = data.credentials;
    request.leafIndex = data.leafIndex;

    console.log(`✅ Registration approved: ${id} → citizen #${data.leafIndex}`);
    return request;
  }

  /**
   * Reject a request
   */
  rejectRequest(id: string, reason: string): RegistrationRequest | null {
    const request = this.requests.get(id);
    if (!request || request.status !== 'pending') {
      return null;
    }

    request.status = 'rejected';
    request.processedAt = Date.now();
    request.rejectionReason = reason;

    console.log(`❌ Registration rejected: ${id} - ${reason}`);
    return request;
  }

  /**
   * Get all pending requests
   */
  getPendingRequests(): RegistrationRequest[] {
    return Array.from(this.requests.values())
      .filter(r => r.status === 'pending')
      .sort((a, b) => a.requestedAt - b.requestedAt);
  }

  /**
   * Get all approved requests
   */
  getApprovedRequests(): RegistrationRequest[] {
    return Array.from(this.requests.values())
      .filter(r => r.status === 'approved')
      .sort((a, b) => (b.processedAt || 0) - (a.processedAt || 0));
  }

  /**
   * Get all rejected requests
   */
  getRejectedRequests(): RegistrationRequest[] {
    return Array.from(this.requests.values())
      .filter(r => r.status === 'rejected')
      .sort((a, b) => (b.processedAt || 0) - (a.processedAt || 0));
  }

  /**
   * Get statistics
   */
  getStats(): RegistrationStats {
    const requests = Array.from(this.requests.values());
    return {
      total: requests.length,
      pending: requests.filter(r => r.status === 'pending').length,
      approved: requests.filter(r => r.status === 'approved').length,
      rejected: requests.filter(r => r.status === 'rejected').length,
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
let storeInstance: RegistrationStore | null = null;

export function getRegistrationStore(): RegistrationStore {
  if (!storeInstance) {
    storeInstance = new RegistrationStore();
  }
  return storeInstance;
}

export function resetRegistrationStore(): void {
  storeInstance = null;
}
