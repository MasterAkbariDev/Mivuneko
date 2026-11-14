param([string]$Root = "$PSScriptRoot/../.local")
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root)
New-Item -ItemType Directory -Path $Root -Force | Out-Null
$venv = Join-Path $Root 'expressive-voice'
$model = Join-Path $Root 'models/qwen3-tts-customvoice'
$python = Join-Path $venv 'Scripts/python.exe'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "The runtime setup failed with exit code $LASTEXITCODE" } }
Write-Output 'Creating the local runtime'
if (!(Test-Path -LiteralPath $python)) { py -3.12 -m venv $venv; Check-Exit }
Write-Output 'Installing local voice and computer libraries'
& $python -m pip install --upgrade pip; Check-Exit
& $python -m pip install qwen-tts==0.1.1 pywinauto==0.6.9 "pillow>=11.2.1" send2trash sherpa-onnx; Check-Exit
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  Write-Output 'Installing NVIDIA acceleration'
  & $python -m pip install --upgrade torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128; Check-Exit
}
else {
  & $python -m pip install --upgrade torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu; Check-Exit
}
Write-Output 'Downloading Qwen3-TTS expressive voice model'
$env:HF_HUB_DISABLE_XET = '1'
& $python -c 'from huggingface_hub import snapshot_download; import sys; snapshot_download("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", local_dir=sys.argv[1])' $model; Check-Exit
$config = @{python=$python; model_dir=$model} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $Root 'local-runtime.json'),$config,[Text.UTF8Encoding]::new($false))
Write-Output 'Local voice and computer runtime ready'
