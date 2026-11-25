# Signs an already built and tested APK with the owner's release key. The app's files are not changed, only the signature.
# The key and its passwords stay outside the repository: apksigner asks for the password itself, it is never an argument.
#   powershell -ExecutionPolicy Bypass -File mobile\tool\sign-release.ps1 -Apk <tested.apk> -Keystore <release key> -BuildTools <sdk\build-tools\35.0.0> -Out <folder>
param(
  [Parameter(Mandatory)] [string]$Apk,
  [Parameter(Mandatory)] [string]$Keystore,
  [Parameter(Mandatory)] [string]$BuildTools,
  [Parameter(Mandatory)] [string]$Out
)
$ErrorActionPreference = 'Stop'
foreach ($f in $Apk, $Keystore, "$BuildTools\lib\apksigner.jar") { if (-not (Test-Path -LiteralPath $f)) { throw "Not found: $f" } }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$key = (Resolve-Path -LiteralPath $Keystore).Path
if ($key.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'The key must not be inside the repository.' }
$java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { 'java' }
$signer = "$BuildTools\lib\apksigner.jar"

# Every file of an APK except the signature: name, size and CRC.
function Get-Content-List([string]$path) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($path)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $zip.Entries | Where-Object { $_.FullName -notmatch '^META-INF/([^/]+\.(SF|RSA|DSA|EC)|MANIFEST\.MF)$' } | ForEach-Object {
      $s = $_.Open(); $h = [BitConverter]::ToString($sha.ComputeHash($s)); $s.Dispose()
      "$($_.FullName) $($_.Length) $h"
    } | Sort-Object
  } finally { $zip.Dispose() }
}

New-Item -ItemType Directory -Force $Out | Out-Null
$target = Join-Path (Resolve-Path -LiteralPath $Out).Path 'clinbridge-android-practice.apk'
if (Test-Path -LiteralPath $target) { throw "Already there, move it away first: $target" }
& $java -jar $signer sign --ks $key --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --out $target $Apk
if ($LASTEXITCODE -ne 0) { if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }; throw 'Signing failed.' }

$certs = & $java -jar $signer verify --verbose --print-certs $target
if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $target; throw 'The signature is not valid.' }
if ($certs -match 'CN=Android Debug') { Remove-Item -LiteralPath $target; throw 'This is the Android debug key. A release needs the release key.' }
$source = (Resolve-Path -LiteralPath $Apk).Path
if (Compare-Object (Get-Content-List $source) (Get-Content-List $target)) { Remove-Item -LiteralPath $target; throw 'The content changed. Do not publish.' }

$certs | Where-Object { $_ -match 'Verified using|certificate (DN|SHA-256)' }
"Source SHA-256: $((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLower())"
"File:           $target"
"Size:           $((Get-Item -LiteralPath $target).Length) bytes"
"SHA-256:        $((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower())"
'The content is the same as in the tested APK; only the signature is new.'
