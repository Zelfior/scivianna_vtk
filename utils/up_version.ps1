# Requires PowerShell 5.1+
# Version tagging and publishing script

$ErrorActionPreference = "Stop"

$currentScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRootDir = Split-Path -Parent $currentScriptDir
$versionFile = Join-Path $projectRootDir "scivianna_vtk\VERSION"

########################
# Main
########################

# Check current repo status
$gitStatus = git status --porcelain

if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
    $answer = Read-Host "Current repository is not clean:`n$gitStatus`nDo you want to continue? (yes/[no])"

    if ([string]::IsNullOrWhiteSpace($answer) -or $answer.ToLower().StartsWith("n")) {
        Write-Host "Exiting after non-clean repository. Answer: $answer"
        exit 0
    }
}

# Get latest semantic version tag
$versionsTagged = git tag |
    Where-Object { $_ -match '^\d+\.\d+\.\d+$' } |
    Sort-Object {
        [version]$_
    } |
    Select-Object -Last 1

$versionName = Read-Host "Found version tagged $versionsTagged, new tag?"

# Validate version format
try {
    $null = [version]$versionName
}
catch {
    Write-Error "Version format is not correct: '$versionName'. Expected x.y.z"
    exit 1
}

# Ensure version is newer
if ($versionsTagged) {
    if ([version]$versionName -le [version]$versionsTagged) {
        Write-Error "Version is lower or equal to existing one: '$versionName' <= $versionsTagged"
        exit 1
    }
}

########################
# Virtual environment
########################

$venvDir = Join-Path $currentScriptDir ".venv_utils"

if (-not (Test-Path $venvDir)) {
    python -m venv $venvDir
}

Write-Host "Activating venv $venvDir"

# Locate activation script
$activateScript = Join-Path $venvDir "Scripts\Activate.ps1"

if (Test-Path $activateScript) {
    Write-Host "Activating PowerShell virtual environment..."
    & $activateScript
}
else {
    $activateScript = Join-Path $venvDir "bin\Activate.ps1"

    if (Test-Path $activateScript) {
        Write-Host "Activating PowerShell virtual environment..."
        & $activateScript
    }
    else {
        Write-Warning "No PowerShell activation script found. Continuing without activation."
    }
}

python -m pip install --upgrade pip setuptools tox

########################
# Tag version
########################

Set-Content -Path $versionFile -Value $versionName -NoNewline

git add $versionFile
git commit -m "Version $versionName"
git tag $versionName

########################
# Install current version
########################

python -m pip install --upgrade $projectRootDir

Push-Location $projectRootDir
tox
Pop-Location

########################
# Push
########################

$answer = Read-Host "Do you want to push version '$versionName'? (yes/[no])"

if ($answer.ToLower().StartsWith("y")) {
    Write-Host "Pushing tag..."
    git push origin
    git push origin $versionName
}
else {
    Write-Host "Reverting tag and aborting..."
    git reset --hard HEAD^
    git tag -d $versionName
    exit 0
}

########################
# Publish
########################

$answer = Read-Host "Do you want to publish version '$versionName'? (yes/[no])"

if ($answer.ToLower().StartsWith("y")) {

    Write-Host "Publishing..."

    if (Test-Path "dist") {
        Remove-Item "dist" -Recurse -Force
    }

    python -m pip install --upgrade build twine
    python -m build
    python -m twine upload --repository pypi dist/*
}
else {
    Write-Host "You pushed a version tag but this version has not been published!"
    exit 1
}