#!/bin/bash

# ZeroQuery Devnet Deployment Automation Script (WSL / Ubuntu)
# Use this script to deploy the Escrow and Verifier programs to Solana Devnet.

set -e

echo "=========================================="
echo " ZeroQuery Devnet Deployer (Ubuntu/WSL) "
echo "=========================================="

# 1. Check prerequisites
if ! command -v solana &> /dev/null; then
    echo "Error: solana-cli is not installed."
    echo "Install via: sh -c \"\$(curl -sSfL https://release.solana.com/v1.18.0/install)\""
    exit 1
fi

if ! command -v anchor &> /dev/null; then
    echo "Error: anchor-cli is not installed."
    echo "Install via: cargo install --git https://github.com/coral-xyz/anchor avm --locked --force && avm install latest && avm use latest"
    exit 1
fi

# 2. Configure Solana to Devnet
echo "[1/4] Configuring solana config to devnet..."
solana config set --url https://api.devnet.solana.com

# 3. Create keypair if it doesn't exist
KEYPAIR_PATH="$HOME/.config/solana/zeroquery-devnet.json"
if [ ! -f "$KEYPAIR_PATH" ]; then
    echo "[2/4] Generating new devnet keypair..."
    solana-keygen new --outfile "$KEYPAIR_PATH" --no-bip39-passphrase
else
    echo "[2/4] Keypair already exists at $KEYPAIR_PATH"
fi
solana config set --keypair "$KEYPAIR_PATH"

# 4. Airdrop SOL (Retry loop since devnet faucet can be flaky)
echo "[3/4] Requesting Devnet Airdrop..."
for i in {1..3}; do
    if solana airdrop 2; then
        echo "Airdrop successful!"
        break
    else
        echo "Airdrop failed, retrying ($i/3)..."
        sleep 5
    fi
done

# 5. Build and Deploy
echo "[4/4] Building and deploying Anchor programs..."
# Build the program first to generate the target/deploy keys
anchor build

# Sync the new Program IDs into the Anchor.toml and source code
anchor keys sync

# Build again with the new synced Program IDs
anchor build

# Deploy to Devnet
anchor deploy --provider.cluster devnet --program-name poi_escrow
anchor deploy --provider.cluster devnet --program-name poi_verifier

echo "=========================================="
echo " Deployment Complete! "
echo " Please update the PITCH_DECK.md and INTEGRATION_GUIDE.md with your new Program IDs."
echo "=========================================="
