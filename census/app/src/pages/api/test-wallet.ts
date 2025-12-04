import { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    // Create a simple test transaction (SOL transfer of 0)
    const payer = new PublicKey(req.body.payer);
    const recipient = new PublicKey('11111111111111111111111111111111');
    
    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: payer,
    });
    
    // Add a simple transfer instruction (0 lamports for testing)
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: recipient,
        lamports: 0,
      })
    );
    
    // Return the transaction for signing
    const serialized = tx.serialize({ requireAllSignatures: false });
    res.status(200).json({
      tx: serialized.toString('base64'),
      blockhash,
      message: 'Test transaction created. Sign and send this to verify wallet works.',
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
