param([string]$model = "openai/gpt-oss-20b")

Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)$') { Set-Item "env:$($matches[1])" $matches[2].Trim() } }
$sys       = [IO.File]::ReadAllText((Resolve-Path prompts/extraction.system.md))
$schemaRaw = [IO.File]::ReadAllText((Resolve-Path schemas/extraction.schema.json))
$sysJson   = ConvertTo-Json -InputObject $sys

$pages = [ordered]@{
 "A_with_email"  = "Nexora Labs is a Pune-based software company with 25 employees. We build web and automation solutions. Founder and CEO Riya Sharma leads the team. Contact: riya@nexoralabs.in"
 "B_no_email"    = "Brightwave Technologies, Bengaluru. IT services and web development for startups. Our CTO, Amit Rao, oversees delivery. Reach us through the contact form."
 "C_not_company" = "404 - Page not found. This domain may be for sale. Contact the registrar."
}

Write-Host "Model: $model"
foreach ($k in $pages.Keys) {
  Write-Host "Running $k..."
  $page     = $pages[$k]
  $pageJson = ConvertTo-Json -InputObject $page
  $body = '{"model":"' + $model + '","temperature":0,"messages":[{"role":"system","content":' + $sysJson + '},{"role":"user","content":' + $pageJson + '}],"response_format":{"type":"json_schema","json_schema":{"name":"lead_extraction","strict":true,"schema":' + $schemaRaw + '}}}'
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r = Invoke-RestMethod https://api.groq.com/openai/v1/chat/completions -Method Post `
         -Headers @{Authorization="Bearer $env:GROQ_API_KEY"} -ContentType "application/json; charset=utf-8" `
         -TimeoutSec 60 -Body ([Text.Encoding]::UTF8.GetBytes($body))
    $o = $r.choices[0].message.content | ConvertFrom-Json
    "=== $k ($([math]::Round($sw.Elapsed.TotalSeconds,1))s) ==="
    $r.choices[0].message.content
    foreach ($s in $o.extracted_evidence_snippets) { if (-not $page.Contains($s)) { "FAIL: snippet not verbatim -> $s" } }
    $e = $o.key_decision_maker.public_business_email
    if ($e -and -not $page.Contains($e)) { "FAIL: email not in page -> $e" }
  } catch {
    "=== $k === ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) { "DETAILS: $($_.ErrorDetails.Message)" }
  }
}