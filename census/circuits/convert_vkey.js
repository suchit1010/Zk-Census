// Convert verification key JSON to Rust format
const fs = require('fs');
const vkey = JSON.parse(fs.readFileSync('build/verification_key.json', 'utf8'));

// Helper to convert field element to 32-byte big-endian array
function fieldToBytes(fieldStr) {
    const bn = BigInt(fieldStr);
    const hex = bn.toString(16).padStart(64, '0');
    const bytes = [];
    for (let i = 0; i < 64; i += 2) {
        bytes.push(`0x${hex.slice(i, i + 2)}`);
    }
    return `[${bytes.join(', ')}]`;
}

// Convert G1 point (x, y) to 64 bytes
function g1ToBytes(point) {
    const x = fieldToBytes(point[0]);
    const y = fieldToBytes(point[1]);
    return `[\n        // x coordinate\n        ${x},\n        // y coordinate\n        ${y}\n    ]`;
}

// Convert G2 point to 128 bytes
function g2ToBytes(point) {
    const x0 = fieldToBytes(point[0][0]);
    const x1 = fieldToBytes(point[0][1]);
    const y0 = fieldToBytes(point[1][0]);
    const y1 = fieldToBytes(point[1][1]);
    return `[\n        // x.c0\n        ${x0},\n        // x.c1\n        ${x1},\n        // y.c0\n        ${y0},\n        // y.c1\n        ${y1}\n    ]`;
}

console.log(`// Auto-generated verification key from snarkjs
// Generated: ${new Date().toISOString()}
// Circuit: census.circom

pub fn get_verification_key() -> VerificationKey {
    VerificationKey {
        alpha: ${g1ToBytes(vkey.vk_alpha_1)},
        
        beta: ${g2ToBytes(vkey.vk_beta_2)},
        
        gamma: ${g2ToBytes(vkey.vk_gamma_2)},
        
        delta: ${g2ToBytes(vkey.vk_delta_2)},
        
        ic: vec![
${vkey.IC.map((ic, i) => `            // IC[${i}]\n            ${g1ToBytes(ic)}`).join(',\n')}
        ],
    }
}`);
