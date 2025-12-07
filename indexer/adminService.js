import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import fs from 'fs/promises';
import path from 'path';

// BN for big number handling
import BN from 'bn.js';

// Program constants
const PROGRAM_ID = process.env.PROGRAM_ID || '9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH';
const CENSUS_STATE_ADDRESS = process.env.CENSUS_STATE_ADDRESS || 'Cm3m5BTxNFXswHQVsaEA6y86kx4WepNUH9yZyvD7bnBG';
const EXPECTED_ADMIN = '3rqrdZaNqMtczK5LHeDNLTEx84xUyCpGtKvFYE5b9SvQ';

// Path to admin keypair (in WSL, this is ~/.config/solana/id.json)
// For Windows, we copy it to indexer/data/admin-keypair.json
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH || './data/admin-keypair.json';

/**
 * Admin Service for auto-approval and on-chain registration
 */
export class AdminService {
  constructor(connection) {
    this.connection = connection;
    this.adminKeypair = null;
    this.programId = new PublicKey(PROGRAM_ID);
    this.censusStateAddress = new PublicKey(CENSUS_STATE_ADDRESS);
  }

  /**
   * Load admin keypair from file
   */
  async loadAdminKeypair() {
    try {
      const keypairPath = path.resolve(ADMIN_KEYPAIR_PATH);
      console.log(`📦 Loading admin keypair from: ${keypairPath}`);
      
      const keypairData = await fs.readFile(keypairPath, 'utf-8');
      const secretKey = new Uint8Array(JSON.parse(keypairData));
      this.adminKeypair = Keypair.fromSecretKey(secretKey);
      
      const adminPubkey = this.adminKeypair.publicKey.toBase58();
      console.log(`✅ Admin keypair loaded: ${adminPubkey}`);
      
      // Verify it matches expected admin
      if (adminPubkey !== EXPECTED_ADMIN) {
        console.warn(`⚠️ Warning: Loaded keypair ${adminPubkey} does not match expected admin ${EXPECTED_ADMIN}`);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to load admin keypair: ${error.message}`);
      console.log(`   Make sure to copy your admin keypair to ${ADMIN_KEYPAIR_PATH}`);
      return false;
    }
  }

  /**
   * Check if admin service is ready
   */
  isReady() {
    return this.adminKeypair !== null;
  }

  /**
   * Get admin public key
   */
  getAdminPubkey() {
    return this.adminKeypair?.publicKey.toBase58() || null;
  }

  /**
   * Derive citizen PDA for a wallet
   */
  deriveCitizenPDA(walletPubkey) {
    const [citizenPDA, bump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('citizen'),
        new PublicKey(walletPubkey).toBuffer()
      ],
      this.programId
    );
    return { citizenPDA, bump };
  }

  /**
   * Register a citizen on-chain using admin keypair
   * This is called automatically after Zassport verification passes
   */
  async registerCitizenOnChain(walletPubkey, commitment, nullifierHash) {
    if (!this.isReady()) {
      throw new Error('Admin service not ready - keypair not loaded');
    }

    console.log(`🔗 Registering citizen on-chain...`);
    console.log(`   Wallet: ${walletPubkey}`);
    console.log(`   Commitment: ${commitment.toString().slice(0, 20)}...`);

    try {
      const userPubkey = new PublicKey(walletPubkey);
      const { citizenPDA } = this.deriveCitizenPDA(walletPubkey);

      // Convert commitment and nullifierHash to proper format
      const commitmentBN = new BN(commitment.toString());
      const nullifierHashBN = new BN(nullifierHash.toString());

      // Build the instruction data for register_citizen
      // Anchor instruction discriminator for "register_citizen" 
      const discriminator = Buffer.from([
        0x25, 0x2a, 0xe7, 0x3c, 0x9a, 0x6e, 0x6c, 0x36
      ]);

      // Encode the instruction data
      // Format: discriminator (8) + commitment (32) + nullifier_hash (32)
      const commitmentBuffer = commitmentBN.toArrayLike(Buffer, 'le', 32);
      const nullifierBuffer = nullifierHashBN.toArrayLike(Buffer, 'le', 32);
      
      const data = Buffer.concat([discriminator, commitmentBuffer, nullifierBuffer]);

      // Build the instruction
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: this.adminKeypair.publicKey, isSigner: true, isWritable: true }, // admin (payer)
          { pubkey: userPubkey, isSigner: false, isWritable: false },                 // user
          { pubkey: this.censusStateAddress, isSigner: false, isWritable: true },     // census_state
          { pubkey: citizenPDA, isSigner: false, isWritable: true },                  // citizen (PDA)
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },    // system_program
        ],
        programId: this.programId,
        data
      });

      // Create and send transaction
      const transaction = new Transaction().add(instruction);
      
      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.adminKeypair.publicKey;

      // Sign and send
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.adminKeypair],
        { commitment: 'confirmed' }
      );

      console.log(`✅ On-chain registration successful!`);
      console.log(`   Signature: ${signature}`);
      console.log(`   Citizen PDA: ${citizenPDA.toBase58()}`);

      return {
        success: true,
        signature,
        citizenPDA: citizenPDA.toBase58()
      };

    } catch (error) {
      console.error(`❌ On-chain registration failed: ${error.message}`);
      
      // Parse Anchor error if present
      if (error.logs) {
        const errorLog = error.logs.find(log => log.includes('Error Number'));
        if (errorLog) {
          console.error(`   Anchor error: ${errorLog}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Check if a wallet is already registered on-chain
   */
  async isWalletRegistered(walletPubkey) {
    try {
      const { citizenPDA } = this.deriveCitizenPDA(walletPubkey);
      const accountInfo = await this.connection.getAccountInfo(citizenPDA);
      return accountInfo !== null;
    } catch (error) {
      console.error(`Error checking registration: ${error.message}`);
      return false;
    }
  }

  /**
   * Get admin balance for fee payments
   */
  async getAdminBalance() {
    if (!this.isReady()) return 0;
    
    const balance = await this.connection.getBalance(this.adminKeypair.publicKey);
    return balance / 1e9; // Convert to SOL
  }
}

/**
 * Create and initialize admin service
 */
export async function createAdminService(connection) {
  const service = new AdminService(connection);
  const loaded = await service.loadAdminKeypair();
  
  if (loaded) {
    const balance = await service.getAdminBalance();
    console.log(`💰 Admin balance: ${balance.toFixed(4)} SOL`);
    
    if (balance < 0.01) {
      console.warn(`⚠️ Warning: Admin balance is low. Registration transactions may fail.`);
    }
  }
  
  return service;
}
