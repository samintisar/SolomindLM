# GitHub Branch Protection Rules Setup Script (PowerShell)
# This script applies standard branch protection rules to the main branch
# using the GitHub CLI (gh)

$ErrorActionPreference = "Stop"

# Add GitHub CLI to PATH (Windows default location)
$env:Path += ";C:\Program Files\GitHub CLI"

# Get repository name
$repo = $env:GITHUB_REPOSITORY
if ([string]::IsNullOrEmpty($repo)) {
    $remoteUrl = git config --get remote.origin.url 2>$null
    if ($remoteUrl -match "github\.com[/:](.+?)(\.git)?$") {
        $repo = $matches[1]
    } else {
        Write-Error "Error: Could not determine repository."
        exit 1
    }
}

Write-Host "Applying branch protection rules to $repo..." -ForegroundColor Cyan

# Create JSON file for branch protection
$json = @{
    # required_approving_review_count = 0: a PR is still required (no direct pushes to
    # main), CI checks are still enforced, but the author can merge without a separate
    # approval. Suits a solo maintainer. Raise to 1 once there's a second reviewer.
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $false
        require_code_owner_reviews = $false
        required_approving_review_count = 0
    }
    # NOTE: E2E is intentionally not a required check. Phase 3 of the CI/CD deployment plan
    # (docs/superpowers/plans/2026-09-08-cicd-deployment-observability.md) moves it to a
    # deployment_status-triggered advisory job; promote to required only once stable.
    required_status_checks = @{
        strict = $true
        checks = @(
            @{ context = "Typecheck (Convex)" }
            @{ context = "Typecheck (Web)" }
            @{ context = "Typecheck (Expo mobile)" }
            @{ context = "Lint (Biome)" }
            @{ context = "Lint (Workflows)" }
            @{ context = "Unit Tests" }
            @{ context = "Test (Mobile)" }
            @{ context = "Build (Web, PR parity)" }
        )
    }
    enforce_admins = $true
    restrictions = $null
    allow_force_pushes = $false
    allow_deletions = $false
} | ConvertTo-Json -Depth 10

$tempFile = [System.IO.Path]::GetTempFileName()
$json | Out-File -FilePath $tempFile -Encoding UTF8

try {
    gh api `
        --method PUT `
        --header "Accept: application/vnd.github+json" `
        "/repos/$repo/branches/main/protection" `
        --input "$tempFile"

    Write-Host ""
    Write-Host "Branch protection rules applied successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Summary of rules applied:" -ForegroundColor Cyan
    Write-Host "  - Branch: main"
    Write-Host "  - Require pull request reviews: Yes (0 approvals - PR required, CI enforced)"
    Write-Host "  - Require status checks: Yes (Typecheck Convex/Web/Mobile, Lint Biome/Workflows, Unit Tests, Test Mobile, Build Web)"
    Write-Host "  - Require branches to be up to date: Yes"
    Write-Host "  - Admin enforcement: Yes"
    Write-Host "  - Allow force pushes: No"
    Write-Host "  - Allow deletions: No"
}
finally {
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}
