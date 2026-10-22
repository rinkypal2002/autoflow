param(
    [Parameter(Mandatory = $true)]
    [string]$EngineRoot,

    [Parameter(Mandatory = $true)]
    [string]$CertificationFile,

    [Parameter(Mandatory = $true)]
    [string]$Confirmation
)

$ErrorActionPreference = 'Stop'

if ($Confirmation -ne 'APPLY_PHASE4C3B_REGISTRY_CONTENT_TYPES') {
    throw 'Invalid confirmation token.'
}

$registryFiles = @(
    (Join-Path $EngineRoot 'Products_Engine\src\main\resources\action-registry.json'),
    (Join-Path $EngineRoot 'docs\ACTION_REGISTRY.json')
)

foreach ($file in $registryFiles) {
    if (-not (Test-Path $file)) {
        throw "Registry file not found: $file"
    }
}

if (-not (Test-Path $CertificationFile)) {
    throw "Certification file not found: $CertificationFile"
}

$certification = Get-Content $CertificationFile -Raw | ConvertFrom-Json

$corrections = @(
    $certification.findings |
        Where-Object { $_.classification -eq 'REGISTRY_METADATA_DRIFT' } |
        ForEach-Object {
            [pscustomobject]@{
                actionKey      = $_.certifiedActionKey
                oldContentType = $_.registryContentType
                newContentType = ($_.actualControllerContentTypes -join ',')
            }
        }
)

if ($corrections.Count -ne 50) {
    throw "Expected 50 certified corrections, found $($corrections.Count)."
}

$duplicateKeys = $corrections |
    Group-Object actionKey |
    Where-Object { $_.Count -ne 1 }

if ($duplicateKeys) {
    throw 'Duplicate certified action keys detected.'
}

$results = @()

foreach ($file in $registryFiles) {
    $parsedRegistry = Get-Content $file -Raw | ConvertFrom-Json
    $registry = @($parsedRegistry)

    if ($registry.Count -ne 343) {
        throw "Expected 343 registry actions in $file, found $($registry.Count)."
    }

    $beforeKeys = @($registry.actionKey)
    $changed = 0

    foreach ($correction in $corrections) {
        $matches = @(
            $registry |
                Where-Object { $_.actionKey -eq $correction.actionKey }
        )

        if ($matches.Count -ne 1) {
            throw "Expected exactly one registry entry for $($correction.actionKey) in $file; found $($matches.Count)."
        }

        $entry = $matches[0]

        if ($entry.contentType -ne $correction.oldContentType) {
            throw "Unexpected existing contentType for $($correction.actionKey): expected '$($correction.oldContentType)', found '$($entry.contentType)'."
        }

        $entry.contentType = $correction.newContentType
        $changed++
    }

    $afterKeys = @($registry.actionKey)

    if (Compare-Object $beforeKeys $afterKeys) {
        throw "Action keys changed unexpectedly in $file."
    }

    if ($registry.Count -ne 343) {
        throw "Registry count changed unexpectedly in $file."
    }

    $json = $registry | ConvertTo-Json -Depth 100

    [IO.File]::WriteAllText(
        $file,
        $json + [Environment]::NewLine,
        (New-Object Text.UTF8Encoding($false))
    )

    $results += [pscustomobject]@{
        file            = $file
        actions         = $registry.Count
        corrected       = $changed
        applicationJson = @(
            $corrections |
                Where-Object { $_.newContentType -eq 'application/json' }
        ).Count
        wildcard        = @(
            $corrections |
                Where-Object { $_.newContentType -eq '*/*' }
        ).Count
    }
}

$hash1 = (Get-FileHash $registryFiles[0] -Algorithm SHA256).Hash
$hash2 = (Get-FileHash $registryFiles[1] -Algorithm SHA256).Hash

if ($hash1 -ne $hash2) {
    throw 'The two registry files are no longer identical.'
}

[pscustomobject]@{
    status                     = 'success'
    verdict                    = 'PHASE4C3B_REGISTRY_CONTENT_TYPE_REMEDIATION_APPLIED'
    correctedActionKeys        = $corrections.Count
    applicationJsonCorrections = @(
        $corrections |
            Where-Object { $_.newContentType -eq 'application/json' }
    ).Count
    wildcardCorrections        = @(
        $corrections |
            Where-Object { $_.newContentType -eq '*/*' }
    ).Count
    registryActionsPreserved   = 343
    registrySha256             = $hash1.ToLower()
    files                      = $results
} | ConvertTo-Json -Depth 10