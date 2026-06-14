<#
.SYNOPSIS
ZeroQuery Devnet Deployment Helper (Windows/PowerShell)

.DESCRIPTION
This script acts as a guide to deploy ZeroQuery to Solana Devnet.
Because compiling Solana BPF contracts on Windows natively is prone to linker errors
(missing dlltool/gcc), this script verifies your environment and strongly advises
running the deployment inside WSL.
#>

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " ZeroQuery Devnet Deployer (Windows) " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check for Solana CLI
if (!(Get-Command solana -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Solana CLI not found in PATH." -ForegroundColor Yellow
}

# Check for Anchor
if (!(Get-Command anchor -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Anchor CLI not found in PATH." -ForegroundColor Yellow
}

Write-Host "`n[CRITICAL WARNING]" -ForegroundColor Red
Write-Host "Deploying Solana programs directly from Windows is highly unstable and often fails"
Write-Host "due to missing BPF linkers and 'dlltool' errors."
Write-Host ""
Write-Host "Please open WSL (Windows Subsystem for Linux) or your Ubuntu VM and run:" -ForegroundColor Green
Write-Host "  bash scripts/deploy_devnet.sh" -ForegroundColor White
Write-Host ""
Write-Host "If you absolutely must try it on Windows anyway, run the following commands manually:"
Write-Host "  1. solana config set --url devnet"
Write-Host "  2. anchor build"
Write-Host "  3. anchor keys sync"
Write-Host "  4. anchor build"
Write-Host "  5. anchor deploy --provider.cluster devnet"
Write-Host "==========================================" -ForegroundColor Cyan
