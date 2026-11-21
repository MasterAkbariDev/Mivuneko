param(
  [string]$Root = "$PSScriptRoot/../.local",
  [string]$ConfigPath = "$PSScriptRoot/../.local/local-runtime.json",
  [string]$StorageManager = "$PSScriptRoot/voice-storage.py",
  [string]$Worker = "$PSScriptRoot/../services/local-runtime/worker.py"
)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root)
$ConfigPath = [IO.Path]::GetFullPath($ConfigPath)
New-Item -ItemType Directory -Path $Root -Force | Out-Null
# Environments are not relocatable. Build at their final unique version path.
$id = 'voice-' + [guid]::NewGuid().ToString('N')
$version = Join-Path $Root "versions/$id"
New-Item -ItemType Directory -Path $version -Force | Out-Null
@{owner='mivuneko-voice-v1';id=$id} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $version '.mivuneko-component.json') -Encoding UTF8
$venv = Join-Path $version 'environment'
$python = Join-Path $venv 'Scripts/python.exe'
$model = Join-Path $version 'model'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "The runtime setup failed with exit code $LASTEXITCODE. Your previous setup is unchanged." } }
$old = $null
if (Test-Path -LiteralPath $ConfigPath) {
  $old = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  if (Test-Path -LiteralPath (Join-Path $old.model_dir 'config.json')) { $model = $old.model_dir }
}
$env:PIP_NO_CACHE_DIR = '1'
$env:HF_HUB_DISABLE_XET = '1'
Write-Output 'Creating a separate runtime; keeping your current setup available'
py -3.12 -m venv --without-pip $venv; Check-Exit
if ($null -ne $old -and (Test-Path -LiteralPath $old.python)) {
  $oldEnvironment = [IO.Directory]::GetParent([IO.Directory]::GetParent($old.python).FullName).FullName
  $oldPackages = Join-Path $oldEnvironment 'Lib/site-packages'
  if (Test-Path -LiteralPath $oldPackages) {
    Write-Output 'Reusing installed libraries in the isolated candidate'
    # Copy files, never hard-link: pip must not change the live environment.
    # Junctions are excluded. Robocopy exit codes below 8 mean success.
    & robocopy.exe $oldPackages (Join-Path $venv 'Lib/site-packages') /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw 'Could not copy existing libraries. The active runtime is unchanged.' }
  }
}
if (!(Test-Path -LiteralPath (Join-Path $venv 'Lib/site-packages/pip/__init__.py'))) {
  & $python -m ensurepip; Check-Exit
}
Write-Output 'Installing local voice and computer libraries without retaining wheel downloads'
& $python -m pip install --upgrade pip; Check-Exit
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  Write-Output 'Installing NVIDIA acceleration'
  & $python -m pip install --upgrade torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128; Check-Exit
} else {
  & $python -m pip install --upgrade torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu; Check-Exit
}
& $python -m pip install qwen-tts==0.1.1 pywinauto==0.6.9 'pillow>=11.2.1' send2trash sherpa-onnx; Check-Exit
if ($model -eq (Join-Path $version 'model')) {
  Write-Output 'Downloading the expressive voice model'
  & $python -c 'from huggingface_hub import snapshot_download; import sys; snapshot_download("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", local_dir=sys.argv[1])' $model; Check-Exit
}
$candidate = Join-Path $version 'candidate.json'
[IO.File]::WriteAllText($candidate,(@{python=$python;model_dir=$model} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output 'Verifying real speech before switching runtimes'
& $python $StorageManager activate --app ([IO.Path]::GetDirectoryName($ConfigPath)) --config $ConfigPath --candidate $candidate --worker $Worker; Check-Exit
Write-Output 'Cleaning verified download archives and obsolete managed versions'
& $python $StorageManager cleanup --app ([IO.Path]::GetDirectoryName($ConfigPath)) --config $ConfigPath --worker $Worker
if ($LASTEXITCODE -ne 0) { Write-Output 'Runtime is ready. Some storage could not be cleaned; retry from Settings.' }
Write-Output 'Local voice and computer runtime ready'
