/**
 * Zassport Integration for ZK Census
 * 
 * This module reads Zassport Identity PDAs from Solana to verify
 * that users have completed passport verification before registering
 * for the census.
 * 
 * Zassport Program: FR6XtcALdJfPRTLzSyhjt5fJ1eoYsEn8kq4vcGAkd8WQ (Devnet)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

// Zassport Program ID on Devnet
export const ZASSPORT_PROGRAM_ID = new PublicKey('FR6XtcALdJfPRTLzSyhjt5fJ1eoYsEn8kq4vcGAkd8WQ');

/**
 * Zassport Identity Account Structure
 * Matches the on-chain Identity account from Zassport program
 */
export interface ZassportIdentity {
  // Account discriminator (8 bytes) - handled by Anchor
  owner: PublicKey;           // 32 bytes - wallet that owns this identity
  commitment: Uint8Array;     // 32 bytes - Poseidon hash of passport data
  nullifier: Uint8Array;      // 32 bytes - prevents double-use
  ageVerified: boolean;       // 1 byte - has age been verified (18+)
  nationalityVerified: boolean; // 1 byte - has nationality been verified
  sanctionsVerified: boolean; // 1 byte - has sanctions check passed
  verifiedAt: number;         // 8 bytes (i64) - Unix timestamp
  expiresAt: number;          // 8 bytes (i64) - When attestation expires
  nationality: number;        // 8 bytes (u64) - ISO 3166-1 numeric code
  bump: number;               // 1 byte - PDA bump seed
}

/**
 * Verification result from checking Zassport
 */
export interface ZassportVerificationResult {
  hasIdentity: boolean;
  isEligible: boolean;
  identity?: ZassportIdentity;
  commitment?: string;        // Hex string for easy use
  nullifier?: string;         // Hex string
  reason?: string;
  error?: string;
}

/**
 * Country code mapping (ISO 3166-1 numeric)
 */
export const COUNTRY_CODES: Record<number, string> = {
  356: 'IND', // India
  840: 'USA', // United States
  826: 'GBR', // United Kingdom
  276: 'DEU', // Germany
  250: 'FRA', // France
  392: 'JPN', // Japan
  156: 'CHN', // China
  36: 'AUS',  // Australia
  124: 'CAN', // Canada
  76: 'BRA',  // Brazil
  // Add more as needed
};

/**
 * Derive the Identity PDA for a given wallet
 * Seeds: ["identity", owner_pubkey]
 */
export function deriveIdentityPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('identity'),
      owner.toBuffer(),
    ],
    ZASSPORT_PROGRAM_ID
  );
}

/**
 * Alternative PDA derivation - some versions use different seeds
 * Seeds: ["passport", owner_pubkey]
 */
export function derivePassportPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('passport'),
      owner.toBuffer(),
    ],
    ZASSPORT_PROGRAM_ID
  );
}

/**
 * Alternative PDA derivation - user account
 * Seeds: ["user", owner_pubkey]
 */
export function deriveUserPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('user'),
      owner.toBuffer(),
    ],
    ZASSPORT_PROGRAM_ID
  );
}

/**
 * Parse raw account data into ZassportIdentity
 * Account layout matches Zassport's Identity struct
 */
function parseIdentityAccount(data: Buffer): ZassportIdentity | null {
  try {
    // Skip 8-byte discriminator
    let offset = 8;
    
    // owner: Pubkey (32 bytes)
    const owner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    // commitment: [u8; 32]
    const commitment = new Uint8Array(data.slice(offset, offset + 32));
    offset += 32;
    
    // nullifier: [u8; 32]
    const nullifier = new Uint8Array(data.slice(offset, offset + 32));
    offset += 32;
    
    // age_verified: bool (1 byte)
    const ageVerified = data[offset] === 1;
    offset += 1;
    
    // nationality_verified: bool (1 byte)
    const nationalityVerified = data[offset] === 1;
    offset += 1;
    
    // sanctions_verified: bool (1 byte)
    const sanctionsVerified = data[offset] === 1;
    offset += 1;
    
    // verified_at: i64 (8 bytes, little-endian)
    const verifiedAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    
    // expires_at: i64 (8 bytes, little-endian)
    const expiresAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    
    // nationality: u64 (8 bytes, little-endian)
    const nationality = Number(data.readBigUInt64LE(offset));
    offset += 8;
    
    // bump: u8 (1 byte)
    const bump = data[offset];
    
    return {
      owner,
      commitment,
      nullifier,
      ageVerified,
      nationalityVerified,
      sanctionsVerified,
      verifiedAt,
      expiresAt,
      nationality,
      bump,
    };
  } catch (e) {
    console.error('Failed to parse Identity account:', e);
    return null;
  }
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Check if a wallet has a valid Zassport identity
 * This is the main function to verify eligibility for ZK Census
 * Tries multiple PDA derivation patterns to find the identity account
 */
export async function verifyZassportIdentity(
  connection: Connection,
  walletPubkey: PublicKey
): Promise<ZassportVerificationResult> {
  try {
    // Try multiple PDA seeds - Zassport may use different patterns
    const pdaDerivations = [
      { name: 'identity', pda: deriveIdentityPDA(walletPubkey) },
      { name: 'passport', pda: derivePassportPDA(walletPubkey) },
      { name: 'user', pda: deriveUserPDA(walletPubkey) },
    ];
    
    let accountInfo = null;
    let usedPDA = '';
    
    for (const { name, pda } of pdaDerivations) {
      const [pdaAddress] = pda;
      console.log(`🔍 Trying Zassport ${name} PDA:`, pdaAddress.toBase58());
      
      try {
        const info = await connection.getAccountInfo(pdaAddress);
        if (info && info.owner.equals(ZASSPORT_PROGRAM_ID)) {
          accountInfo = info;
          usedPDA = name;
          console.log(`✅ Found Zassport account using "${name}" seed`);
          break;
        }
      } catch (e) {
        console.warn(`Failed to check ${name} PDA:`, e);
      }
    }
    
    // Also try to find any accounts owned by the Zassport program for this wallet
    if (!accountInfo) {
      console.log('🔍 Searching for Zassport accounts by program owner...');
      try {
        const accounts = await connection.getProgramAccounts(ZASSPORT_PROGRAM_ID, {
          filters: [
            {
              memcmp: {
                offset: 8, // After discriminator
                bytes: walletPubkey.toBase58(),
              },
            },
          ],
        });
        
        if (accounts.length > 0) {
          console.log(`✅ Found ${accounts.length} Zassport account(s) via search`);
          accountInfo = accounts[0].account;
          usedPDA = 'search';
        }
      } catch (e) {
        console.warn('getProgramAccounts search failed:', e);
      }
    }
    
    if (!accountInfo) {
      return {
        hasIdentity: false,
        isEligible: false,
        reason: 'No Zassport identity found. Please verify your passport at zassport.vercel.app first.',
      };
    }
    
    // Parse the account data
    const identity = parseIdentityAccount(accountInfo.data as Buffer);
    
    if (!identity) {
      return {
        hasIdentity: false,
        isEligible: false,
        reason: 'Failed to parse Zassport identity data.',
        error: 'Parse error - account structure may have changed',
      };
    }
    
    console.log('📋 Parsed Zassport identity:', {
      owner: identity.owner.toBase58(),
      ageVerified: identity.ageVerified,
      nationalityVerified: identity.nationalityVerified,
      nationality: identity.nationality,
      verifiedAt: new Date(identity.verifiedAt * 1000).toISOString(),
    });
    
    // Verify owner matches (skip if owner field is zeroed - some versions don't store owner)
    const ownerIsZero = identity.owner.toBase58() === '11111111111111111111111111111111';
    if (!ownerIsZero && !identity.owner.equals(walletPubkey)) {
      return {
        hasIdentity: true,
        isEligible: false,
        identity,
        reason: 'Identity owner mismatch.',
      };
    }
    
    // Check if age is verified (required for census)
    if (!identity.ageVerified) {
      return {
        hasIdentity: true,
        isEligible: false,
        identity,
        reason: 'Age verification required. Please complete age proof at zassport.vercel.app.',
      };
    }
    
    // Check if attestation is expired
    const now = Math.floor(Date.now() / 1000);
    if (identity.expiresAt > 0 && identity.expiresAt < now) {
      return {
        hasIdentity: true,
        isEligible: false,
        identity,
        reason: 'Zassport attestation has expired. Please re-verify at zassport.vercel.app.',
      };
    }
    
    // All checks passed!
    return {
      hasIdentity: true,
      isEligible: true,
      identity,
      commitment: bytesToHex(identity.commitment),
      nullifier: bytesToHex(identity.nullifier),
    };
    
  } catch (error: any) {
    console.error('Error verifying Zassport identity:', error);
    return {
      hasIdentity: false,
      isEligible: false,
      reason: 'Failed to verify Zassport identity.',
      error: error.message,
    };
  }
}

/**
 * Get nationality name from code
 */
export function getNationalityName(code: number): string {
  return COUNTRY_CODES[code] || `Unknown (${code})`;
}

/**
 * Format verification status for display
 */
export function formatVerificationStatus(identity: ZassportIdentity): {
  ageStatus: string;
  nationalityStatus: string;
  sanctionsStatus: string;
  verifiedDate: string;
  expiryDate: string;
  nationality: string;
} {
  return {
    ageStatus: identity.ageVerified ? '✅ Verified 18+' : '❌ Not Verified',
    nationalityStatus: identity.nationalityVerified ? '✅ Verified' : '⏳ Pending',
    sanctionsStatus: identity.sanctionsVerified ? '✅ Clear' : '⏳ Not Checked',
    verifiedDate: new Date(identity.verifiedAt * 1000).toLocaleDateString(),
    expiryDate: identity.expiresAt > 0 
      ? new Date(identity.expiresAt * 1000).toLocaleDateString()
      : 'Never',
    nationality: identity.nationality > 0 
      ? getNationalityName(identity.nationality)
      : 'Not disclosed',
  };
}

/**
 * Generate ZK Census identity from Zassport commitment
 * This creates a deterministic identity that is bound to the passport
 */
export async function generateCensusIdentityFromZassport(
  zassportCommitment: Uint8Array,
  walletPubkey: PublicKey,
  salt: bigint = BigInt(Date.now())
): Promise<{
  identityNullifier: bigint;
  identityTrapdoor: bigint;
  identityCommitment: bigint;
}> {
  // Use the Zassport commitment as entropy for generating census identity
  // This binds the census identity to the real passport
  
  const encoder = new TextEncoder();
  
  // Generate nullifier from Zassport commitment + wallet + "nullifier" domain
  const nullifierInput = new Uint8Array([
    ...Array.from(zassportCommitment),
    ...Array.from(walletPubkey.toBytes()),
    ...Array.from(encoder.encode('zk-census-nullifier')),
  ]);
  const nullifierHash = await crypto.subtle.digest('SHA-256', nullifierInput.buffer as ArrayBuffer);
  const identityNullifier = bytesToBigInt(new Uint8Array(nullifierHash)) % FIELD_PRIME;
  
  // Generate trapdoor from salt + Zassport commitment + "trapdoor" domain
  const saltBytes = new Uint8Array(8);
  const saltView = new DataView(saltBytes.buffer);
  saltView.setBigUint64(0, BigInt(salt), true);
  
  const trapdoorInput = new Uint8Array([
    ...Array.from(saltBytes),
    ...Array.from(zassportCommitment),
    ...Array.from(encoder.encode('zk-census-trapdoor')),
  ]);
  const trapdoorHash = await crypto.subtle.digest('SHA-256', trapdoorInput.buffer as ArrayBuffer);
  const identityTrapdoor = bytesToBigInt(new Uint8Array(trapdoorHash)) % FIELD_PRIME;
  
  // Generate commitment from nullifier + trapdoor
  const commitmentInput = encoder.encode(
    identityNullifier.toString() + ':' + identityTrapdoor.toString()
  );
  const commitmentHash = await crypto.subtle.digest('SHA-256', commitmentInput.buffer as ArrayBuffer);
  const identityCommitment = bytesToBigInt(new Uint8Array(commitmentHash)) % FIELD_PRIME;
  
  return {
    identityNullifier,
    identityTrapdoor,
    identityCommitment,
  };
}

// Field prime for BN254 curve (used in Groth16)
const FIELD_PRIME = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

// Helper to convert bytes to BigInt
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    result += BigInt(bytes[i]) * (BigInt(256) ** BigInt(i));
  }
  return result;
}

/**
 * Get the Zassport verification URL for a wallet
 */
export function getZassportURL(walletPubkey?: string): string {
  const baseURL = 'https://zassport.vercel.app/claims';
  if (walletPubkey) {
    return `${baseURL}?wallet=${walletPubkey}`;
  }
  return baseURL;
}

/**
 * Check if we're on the correct network for Zassport
 */
export function isZassportNetworkSupported(endpoint: string): boolean {
  // Zassport is deployed on Devnet
  return endpoint.includes('devnet') || endpoint.includes('localhost');
}
