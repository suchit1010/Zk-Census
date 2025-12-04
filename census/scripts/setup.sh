#!/bin/bash
# zk-Census Setup Script
# Run this after cloning the repository

set -e

echo "🌿 Setting up zk-Census..."

# 1. Install root dependencies
echo "📦 Installing root dependencies..."
yarn install

# 2. Install circuit dependencies
echo "🔐 Installing circuit dependencies..."
cd circuits
yarn install

# 3. Download Powers of Tau for trusted setup
echo "⬇️ Downloading Powers of Tau (this may take a while)..."
if [ ! -f "pot20_final.ptau" ]; then
    wget -q --show-progress https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_21.ptau -O pot20_final.ptau
fi

# 4. Compile circuit
echo "⚙️ Compiling Circom circuit..."
mkdir -p build
circom census.circom --r1cs --wasm --sym -o build

# 5. Generate proving/verification keys
echo "🔑 Generating Groth16 keys..."
npx snarkjs groth16 setup build/census.r1cs pot20_final.ptau build/census_0000.zkey
npx snarkjs zkey contribute build/census_0000.zkey build/census_final.zkey --name="Census Setup" -v -e="random entropy"
npx snarkjs zkey export verificationkey build/census_final.zkey build/verification_key.json

echo "✅ Circuit setup complete!"

# 6. Copy WASM and keys to app
cd ..
mkdir -p app/public/circuits
cp circuits/build/census_js/census.wasm app/public/circuits/
cp circuits/build/census_final.zkey app/public/circuits/
cp circuits/build/verification_key.json app/public/circuits/

# 7. Install app dependencies
echo "📦 Installing frontend dependencies..."
cd app
yarn install
cd ..

# 8. Build Anchor program
echo "⚓ Building Anchor program..."
anchor build

echo ""
echo "🎉 zk-Census setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start local validator: solana-test-validator"
echo "  2. Deploy program: anchor deploy"
echo "  3. Run tests: anchor test"
echo "  4. Start frontend: cd app && yarn dev"
echo ""
