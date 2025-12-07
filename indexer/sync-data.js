/**
 * Sync Script: Populate registration_requests.json from citizens.json
 * 
 * Run this once to sync existing citizens data with registration requests
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

async function syncData() {
  console.log('🔄 Syncing registration data...\n');
  
  // Load existing data
  const citizensData = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'citizens.json'), 'utf-8'));
  const requestsData = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'registration_requests.json'), 'utf-8'));
  const treeData = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'tree.json'), 'utf-8'));
  
  console.log(`📊 Current state:`);
  console.log(`   Citizens: ${citizensData.length}`);
  console.log(`   Registration requests: ${requestsData.length}`);
  console.log(`   Tree leaves: ${treeData.leaves?.length || 0}\n`);
  
  // Create registration requests for citizens that don't have one
  const newRequests = [];
  
  for (const citizen of citizensData) {
    // Check if request exists for this commitment
    const existingRequest = requestsData.find(r => 
      r.identityCommitment === citizen.commitment || 
      r.walletPubkey === citizen.walletPubkey
    );
    
    if (!existingRequest) {
      const request = {
        id: `reg_${Date.now()}_${citizen.leafIndex}`,
        walletPubkey: citizen.walletPubkey || `legacy_wallet_${citizen.leafIndex}`,
        zassportPDA: null,
        zassportData: {
          isValid: true,
          isAdult: true,
          verifiedAt: new Date(citizen.registeredAt).getTime(),
        },
        requestedAt: new Date(citizen.registeredAt).getTime(),
        status: 'approved',
        processedAt: new Date(citizen.registeredAt).getTime(),
        processedBy: '3rqrdZaNqMtczK5LHeDNLTEx84xUyCpGtKvFYE5b9SvQ',
        identityCommitment: citizen.commitment,
        leafIndex: citizen.leafIndex,
        credentials: null, // Legacy citizens don't have stored credentials
      };
      
      newRequests.push(request);
      console.log(`   ✅ Created request for leaf #${citizen.leafIndex}`);
    }
  }
  
  if (newRequests.length > 0) {
    // Merge and save
    const allRequests = [...requestsData, ...newRequests];
    await fs.writeFile(
      path.join(DATA_DIR, 'registration_requests.json'),
      JSON.stringify(allRequests, null, 2)
    );
    console.log(`\n✅ Added ${newRequests.length} registration requests`);
  } else {
    console.log('\n✅ All citizens already have registration requests');
  }
  
  console.log('\n🎉 Sync complete!');
}

syncData().catch(console.error);
