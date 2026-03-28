param([string]$Token)

$h = @{
    Authorization = "token $Token"
    "User-Agent"  = "kiro"
    Accept        = "application/vnd.github.v3+json"
}
$repo = "Hahfyeex/Stellar-PolyMarket"
$dir  = Join-Path $PSScriptRoot "issue-bodies"

function Patch([int]$num) {
    $file = Join-Path $dir "$num.md"
    if (-not (Test-Path $file)) { Write-Host "SKIP #$num (no file)"; return }
    $body = Get-Content $file -Raw
    $p = @{ body = $body } | ConvertTo-Json -Depth 3 -Compress
    try {
        $r = Invoke-RestMethod "https://api.github.com/repos/$repo/issues/$num" `
            -Method PATCH -Headers $h -Body $p -ContentType "application/json"
        Write-Host ("OK #" + $num + ": " + $r.title)
    } catch {
        Write-Host ("FAIL #" + $num + ": " + $_.Exception.Message)
    }
    Start-Sleep -Seconds 2
}

116..155 | ForEach-Object { Patch $_ }
Write-Host "ALL DONE"
