# ZK Census Deployment Guide

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│   Next.js App   │────▶│  Verifier API    │────▶│  Solana Chain   │
│   (Vercel)      │     │  (Railway/Render)│     │  (Devnet/Main)  │
│                 │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         │                       │ Ed25519 Sign
         │                       ▼
         │              ┌──────────────────┐
         │              │  snarkjs Verify  │
         │              │  (Groth16)       │
         │              └──────────────────┘
         │
         │     ┌──────────────────┐
         └────▶│  Indexer API     │
               │  (Railway/Render)│
               └──────────────────┘
```

## 1. Deploy Verifier API (Required)

The verifier API handles real Groth16 verification and attestation signing.

### Option A: Railway.app (Recommended)

1. Push `api/` folder to GitHub
2. Connect Railway to your repo
3. Set build command: `npm install`
4. Set start command: `node server.js`
5. Add environment variables:
   - `PORT=3001` (Railway will override this)
   - `NODE_ENV=production`

### Option B: Render.com

1. Create new Web Service
2. Connect to GitHub repo
3. Root directory: `api`
4. Build command: `npm install`
5. Start command: `node server.js`

### Option C: Fly.io

```bash
cd api
fly launch
fly secrets set NODE_ENV=production
fly deploy
```

**Important:** Note down your deployed API URL (e.g., `https://zk-census-api.railway.app`)

## 2. Deploy Indexer API (Required)

The indexer maintains the Merkle tree and provides proofs.

Same process as Verifier API, but from `indexer/` folder.

## 3. Deploy Frontend to Vercel

### Step 1: Set Environment Variables

In Vercel Dashboard or `.env.production`:

```env
NEXT_PUBLIC_VERIFIER_API_URL=https://your-verifier-api.railway.app
NEXT_PUBLIC_INDEXER_API_URL=https://your-indexer-api.railway.app
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=9TNbyekg5Ck8Hx9EMwDNcH97sDZYZJamdvnGFhwH1UsH
```

### Step 2: Deploy

```bash
cd census/app
vercel --prod
```

Or connect GitHub repo to Vercel for auto-deploy.

### Step 3: Configure Vercel Build

In `vercel.json` (if needed):

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

## 4. Configure Trusted Verifier on Solana

The on-chain program needs to know the verifier's public key.

### Get Verifier Public Key

```bash
# From verifier API logs or:
curl https://your-verifier-api.railway.app/health
# Returns: { "verifierPubkey": "DQxUgX9q4ouyMk2EuD5yfenKYbHkgrXjPJ1kfcxh2EYK", ... }
```

### Update Program (if needed)

If you need to change the trusted verifier:

1. Update `submit_attestation.rs` with new verifier pubkey
2. Rebuild: `anchor build`
3. Deploy: `anchor deploy --provider.cluster devnet`

## 5. Setup Checklist

- [ ] Verifier API deployed and accessible
- [ ] Indexer API deployed and accessible
- [ ] Frontend deployed to Vercel
- [ ] Environment variables configured
- [ ] Solana program deployed to devnet
- [ ] Trusted verifier pubkey matches deployed API
- [ ] ZK circuit files (wasm, zkey) hosted on CDN or served by frontend

## 6. Testing Production Deployment

```bash
# Test verifier API
curl -X POST https://your-verifier-api.railway.app/api/verify \
  -H "Content-Type: application/json" \
  -d '{"proof": {...}, "publicSignals": [...]}'

# Test indexer API
curl https://your-indexer-api.railway.app/health

# Test frontend
# Visit https://your-app.vercel.app
```

## 7. Monitoring

### Logs

- Vercel: Dashboard → Deployments → Logs
- Railway: Dashboard → Service → Logs
- Render: Dashboard → Service → Logs

### Health Endpoints

- Verifier: `GET /health`
- Indexer: `GET /health`

## 8. Security Considerations

1. **Verifier Keypair**: The verifier keypair is auto-generated on first run.
   For production, use a persistent keypair stored securely.

2. **Rate Limiting**: Add rate limiting to APIs to prevent abuse.

3. **CORS**: Configure proper CORS origins in production.

4. **HTTPS**: Ensure all APIs are served over HTTPS.

## 9. Cost Estimates

| Service | Free Tier | Paid |
|---------|-----------|------|
| Vercel | 100GB bandwidth | $20/mo |
| Railway | 500 hours | $5/mo |
| Render | 750 hours | $7/mo |
| Solana (Devnet) | Free | Free |
| Solana (Mainnet) | N/A | ~$0.001/tx |

## 10. Troubleshooting

### "Failed to generate proof"
- Ensure circuit files (wasm, zkey) are accessible
- Check browser console for CORS errors

### "Verification failed"
- Check verifier API logs
- Verify proof format matches expected

### "Attestation expired"
- Attestation is valid for 5 minutes
- Ensure client/server clocks are synchronized

### "Invalid verifier"
- Verifier pubkey in on-chain program doesn't match API
- Redeploy program with correct pubkey
