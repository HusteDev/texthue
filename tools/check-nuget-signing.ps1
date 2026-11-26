param([Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference = 'Stop'
$packages = @(Get-ChildItem -LiteralPath $Directory -Filter '*.nupkg' -File)
if ($packages.Count -ne 1 -or $packages[0].Name -notmatch '^TextHue\.(\d+\.\d+\.\d+)\.nupkg$') {
    throw 'Expected one staged TextHue release package'
}
$version = $Matches[1]
$archive = $packages[0]
$project = Join-Path $PSScriptRoot 'NuGetState'
dotnet build $project -c Release --nologo
if ($LASTEXITCODE) { throw 'NuGet state checker build failed' }
$checker = Join-Path $project 'bin/Release/net10.0/NuGetState.dll'
$temp = [System.IO.Directory]::CreateTempSubdirectory('texthue-signing-')
try {
    $rsa = [System.Security.Cryptography.RSA]::Create(3072)
    $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
        'CN=TextHue local test', $rsa, 'SHA256', [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $usage = [System.Security.Cryptography.OidCollection]::new()
    [void]$usage.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
    $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($usage, $true))
    $now = [DateTimeOffset]::UtcNow
    $certificate = $request.CreateSelfSigned($now.AddMinutes(-5), $now.AddDays(1))
    $pfx = Join-Path $temp.FullName 'fixture.pfx'
    [IO.File]::WriteAllBytes($pfx, $certificate.Export('Pfx', 'fixture'))
    foreach ($change in @($false, $true)) {
        $copy = Join-Path $temp.FullName $archive.Name
        Copy-Item -LiteralPath $archive.FullName -Destination $copy -Force
        if ($change) {
            $zip = [IO.Compression.ZipFile]::Open($copy, 'Update')
            try { [void]$zip.CreateEntry('changed.txt') } finally { $zip.Dispose() }
        }
        dotnet nuget sign $copy --certificate-path $pfx --certificate-password fixture
        if ($LASTEXITCODE) { throw 'Local fixture signing failed' }
        $state = dotnet $checker $version $archive.FullName $copy
        if ($change) {
            if ($LASTEXITCODE -ne 1 -or $state -ne 'conflicting') { throw 'Accepted changed package' }
        } elseif ($LASTEXITCODE -ne 0 -or $state -ne 'matching') { throw 'Rejected signed copy' }
    }
    Write-Output 'PASS: signed original matched and signed changed package conflicted'
} finally {
    if ($certificate) { $certificate.Dispose() }
    if ($rsa) { $rsa.Dispose() }
    $temp.Delete($true)
}
exit 0
