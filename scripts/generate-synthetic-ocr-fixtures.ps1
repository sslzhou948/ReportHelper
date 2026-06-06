Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutRoot = Join-Path $Root "tests\fixtures\synthetic-ocr"
$ImageDir = Join-Path $OutRoot "images"
$GoldenDir = Join-Path $OutRoot "golden"
New-Item -ItemType Directory -Force -Path $ImageDir, $GoldenDir | Out-Null

function New-Font($size, $style = [System.Drawing.FontStyle]::Regular) {
  return [System.Drawing.Font]::new("Microsoft YaHei", [single]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function New-Brush($color) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color))
}

function Draw-Text($g, $text, $x, $y, $size, $color = "#333333", $style = [System.Drawing.FontStyle]::Regular) {
  $font = New-Font $size $style
  $brush = New-Brush $color
  $g.DrawString([string]$text, $font, $brush, [single]$x, [single]$y)
  $font.Dispose()
  $brush.Dispose()
}

function Draw-Line($g, $x1, $y1, $x2, $y2, $color = "#dddddd", $width = 2) {
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($color), [single]$width)
  $g.DrawLine($pen, [single]$x1, [single]$y1, [single]$x2, [single]$y2)
  $pen.Dispose()
}

function Draw-Rect($g, $x, $y, $w, $h, $color = "#dddddd", $width = 2) {
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($color), [single]$width)
  $g.DrawRectangle($pen, [single]$x, [single]$y, [single]$w, [single]$h)
  $pen.Dispose()
}

function Fill-Rect($g, $x, $y, $w, $h, $color) {
  $brush = New-Brush $color
  $g.FillRectangle($brush, [single]$x, [single]$y, [single]$w, [single]$h)
  $brush.Dispose()
}

function Draw-TopBar($g, $title = "返回") {
  Fill-Rect $g 0 0 1080 230 "#00572f"
  Draw-Text $g "2:40" 115 38 42 "#ffffff" ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g "4G  72" 835 40 34 "#ffffff" ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g "‹ $title" 30 145 42 "#ffffff"
}

function Save-Png($bitmap, $name) {
  $path = Join-Path $ImageDir $name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

function New-Canvas($height = 1920) {
  $bitmap = [System.Drawing.Bitmap]::new(1080, $height)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  Fill-Rect $g 0 0 1080 $height "#ffffff"
  return @{ Bitmap = $bitmap; Graphics = $g }
}

function Draw-LabHeader($g, $project, $orderNo, $patient = "测试一号", $doctor = "90001", $reviewer = "测试医生", $receiveTime = "10:46:37", $applyTime = "08:39:08", $reviewTime = "13:34:30") {
  Draw-TopBar $g
  Draw-Rect $g 5 255 1070 585 "#dddddd" 2
  Draw-Line $g 5 335 1075 335 "#dddddd" 2
  Draw-Text $g "北京协和医院检验报告单" 320 278 38 "#333333"
  Draw-Text $g "单号：" 35 355 38
  Draw-Text $g $orderNo 170 355 38
  Draw-Text $g "检验项目：" 35 420 38
  Draw-Text $g $project 250 420 38
  Draw-Text $g "姓名：" 35 485 38
  Draw-Text $g $patient 170 485 38
  Draw-Text $g "申请科室：" 540 485 38
  Draw-Text $g "泌尿外科门诊" 750 485 38
  Draw-Text $g "申请医生：" 35 550 38
  Draw-Text $g $doctor 250 550 38
  Draw-Text $g "样本类型：" 540 550 38
  Draw-Text $g "血" 750 550 38
  Draw-Text $g "接收日期：" 35 615 38
  Draw-Text $g "2025-12-22" 250 615 38
  Draw-Text $g $receiveTime 35 675 38
  Draw-Text $g "申请日期：" 540 615 38
  Draw-Text $g "2025-12-22" 750 615 38
  Draw-Text $g $applyTime 540 675 38
  Draw-Text $g "审核医生：" 35 740 38
  Draw-Text $g $reviewer 250 740 38
  Draw-Text $g "审核日期：" 540 740 38
  Draw-Text $g "2025-12-22" 750 740 38
  Draw-Text $g $reviewTime 540 800 38
}

function Draw-LabTable($g, $rows, $startY = 840) {
  Draw-Rect $g 5 $startY 1070 80 "#dddddd" 2
  Draw-Text $g "项目" 180 ($startY + 18) 36
  Draw-Text $g "结果" 430 ($startY + 18) 36
  Draw-Text $g "参考范围" 700 ($startY + 18) 36
  Draw-Text $g "单位" 965 ($startY + 18) 36
  $y = $startY + 80
  foreach ($row in $rows) {
    $h = if ($row.ContainsKey("Height")) { [int]$row.Height } else { 78 }
    Draw-Line $g 5 $y 1075 $y "#e4e4e4" 2
    Draw-Text $g $row.Name 20 ($y + 18) 34
    Draw-Text $g $row.Value 430 ($y + 18) 34
    $arrow = if ($row.ContainsKey("Arrow")) { $row.Arrow } else { "" }
    if ($arrow -eq "up") { Draw-Text $g "↑" 555 ($y + 14) 40 "#d33b3b" }
    if ($arrow -eq "down") { Draw-Text $g "↓" 555 ($y + 14) 40 "#3b8a5f" }
    Draw-Text $g $row.Ref 675 ($y + 18) 34
    Draw-Text $g $row.Unit 945 ($y + 18) 34
    $y += $h
  }
  Draw-Line $g 5 $y 1075 $y "#dddddd" 2
  Draw-Text $g "备注：" 5 ($y + 20) 34
  Draw-Text $g "此报告仅作参考，以医院打印纸质报告为准。" 5 ($y + 72) 32 "#e8a000" ([System.Drawing.FontStyle]::Bold)
}

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Write-JsonNoBom($path, $value, $depth = 10) {
  $json = $value | ConvertTo-Json -Depth $depth
  [System.IO.File]::WriteAllText($path, $json, $Utf8NoBom)
}

function Write-Golden($id, $golden) {
  $path = Join-Path $GoldenDir "$id.json"
  Write-JsonNoBom $path $golden 10
}

function New-ActhImage {
  $c = New-Canvas 1920
  $g = $c.Graphics
  Draw-LabHeader $g "血浆ACTH (8AM)" "TST20251222001"
  Draw-LabTable $g @(@{ Name = "*促肾上腺皮质激素"; Value = "301.0"; Arrow = "up"; Ref = "7.2-63.3"; Unit = "pg/ml" })
  $g.Dispose()
  Save-Png $c.Bitmap "synthetic_acth.png"
  Write-Golden "synthetic_acth" @{
    caseId = "synthetic_acth"; status = "structured"; modality = "laboratory"
    basicInfo = @{ hospital = "北京协和医院"; reportDate = "2025-12-22"; type = "血浆ACTH (8AM)" }
    metrics = @(@{ metricKey = "acth"; metricName = "促肾上腺皮质激素"; valueNumeric = 301; unit = "pg/ml"; refRangeLow = 7.2; refRangeHigh = 63.3; tone = "high" })
    expectedFields = @("hospital", "reportDate", "metricName", "value", "unit", "referenceRange", "tone")
  }
}

function New-ThyroidImage {
  $c = New-Canvas 1920
  $g = $c.Graphics
  Draw-LabHeader $g "甲功1" "TST20251222002" "测试二号" "90002" "测试医生"
  Draw-LabTable $g @(
    @{ Name = "△游离三碘甲状腺原氨酸"; Value = "3.65"; Ref = "1.80-4.10"; Unit = "pg/ml"; Height = 98 },
    @{ Name = "△游离甲状腺素"; Value = "1.04"; Ref = "0.81-1.89"; Unit = "ng/dl" },
    @{ Name = "△促甲状腺激素"; Value = "3.596"; Ref = "0.380-4.340"; Unit = "μIU/mL" }
  )
  $g.Dispose()
  Save-Png $c.Bitmap "synthetic_thyroid.png"
  Write-Golden "synthetic_thyroid" @{
    caseId = "synthetic_thyroid"; status = "structured"; modality = "laboratory"
    basicInfo = @{ hospital = "北京协和医院"; reportDate = "2025-12-22"; type = "甲功1" }
    metrics = @(
      @{ metricKey = "ft3"; metricName = "游离三碘甲状腺原氨酸"; valueNumeric = 3.65; unit = "pg/ml"; refRangeLow = 1.8; refRangeHigh = 4.1; tone = "ok" },
      @{ metricKey = "ft4"; metricName = "游离甲状腺素"; valueNumeric = 1.04; unit = "ng/dl"; refRangeLow = 0.81; refRangeHigh = 1.89; tone = "ok" },
      @{ metricKey = "tsh"; metricName = "促甲状腺激素"; valueNumeric = 3.596; unit = "μIU/mL"; refRangeLow = 0.38; refRangeHigh = 4.34; tone = "ok" }
    )
    expectedFields = @("hospital", "reportDate", "metricName", "value", "unit", "referenceRange", "tone")
  }
}

function New-BiochemImage {
  $c = New-Canvas 2400
  $g = $c.Graphics
  Draw-LabHeader $g "尿酸、电解质、血脂" "TST20251222003" "测试四号" "90003" "测试医生"
  Draw-LabTable $g @(
    @{ Name = "△丙氨酸氨基转移酶"; Value = "27"; Ref = "7-40"; Unit = "U/L" },
    @{ Name = "△总蛋白"; Value = "71"; Ref = "60-85"; Unit = "g/L" },
    @{ Name = "△白蛋白(BCG法)"; Value = "45"; Ref = "35-52"; Unit = "g/L" },
    @{ Name = "△天门冬氨酸氨基转移酶"; Value = "41"; Arrow = "up"; Ref = "13-35"; Unit = "U/L"; Height = 108 },
    @{ Name = "△钾"; Value = "4.0"; Ref = "3.5-5.5"; Unit = "mmol/L" },
    @{ Name = "△钠"; Value = "138"; Ref = "135-145"; Unit = "mmol/L" },
    @{ Name = "△肌酐(酶法)"; Value = "43"; Arrow = "down"; Ref = "45-84"; Unit = "μmol/L" },
    @{ Name = "△尿酸"; Value = "112"; Arrow = "down"; Ref = "150-357"; Unit = "μmol/L" },
    @{ Name = "△总胆固醇"; Value = "5.81"; Arrow = "up"; Ref = "<5.2 边缘升高"; Unit = "mmol/L"; Height = 120 },
    @{ Name = "△甘油三酯"; Value = "1.33"; Ref = "合适水平 <1.7"; Unit = "mmol/L"; Height = 110 },
    @{ Name = "△高密度脂蛋白胆固醇"; Value = "2.27"; Ref = "降低 <1.0"; Unit = "mmol/L"; Height = 110 },
    @{ Name = "△低密度脂蛋白胆固醇"; Value = "2.46"; Ref = "<3.4 中高危"; Unit = "mmol/L"; Height = 120 }
  ) 840
  $g.Dispose()
  Save-Png $c.Bitmap "synthetic_biochem_lipid.png"
  Write-Golden "synthetic_biochem_lipid" @{
    caseId = "synthetic_biochem_lipid"; status = "structured"; modality = "laboratory"
    basicInfo = @{ hospital = "北京协和医院"; reportDate = "2025-12-22"; type = "尿酸、电解质、血脂" }
    metrics = @(
      @{ metricKey = "ast"; metricName = "天门冬氨酸氨基转移酶"; valueNumeric = 41; unit = "U/L"; refRangeLow = 13; refRangeHigh = 35; tone = "high" },
      @{ metricKey = "creatinine"; metricName = "肌酐(酶法)"; valueNumeric = 43; unit = "μmol/L"; refRangeLow = 45; refRangeHigh = 84; tone = "low" },
      @{ metricKey = "uric_acid"; metricName = "尿酸"; valueNumeric = 112; unit = "μmol/L"; refRangeLow = 150; refRangeHigh = 357; tone = "low" },
      @{ metricKey = "tc"; metricName = "总胆固醇"; valueNumeric = 5.81; unit = "mmol/L"; refRangeHigh = 5.2; tone = "high" }
    )
    expectedFields = @("hospital", "reportDate", "metricName", "value", "unit", "referenceRange", "tone")
  }
}

function New-CtImage {
  $c = New-Canvas 1920
  $g = $c.Graphics
  Draw-TopBar $g "返回                 检查报告详情                 影像报告"
  Fill-Rect $g 40 230 1000 1280 "#ffffff"
  Draw-Text $g "北京协和医院" 430 235 30 "#666666"
  Draw-Text $g "胸腹盆CT平扫" 420 260 42 "#333333"
  $y = 355
  foreach ($line in @(
    @("医院：", "北京协和医院"),
    @("姓名：", "测试三号"),
    @("单号：", "SYNCT20251222001"),
    @("开单医师：", "测试医生"),
    @("检查日期：", "2025-12-22")
  )) {
    Draw-Text $g $line[0] 80 $y 34 "#777777"
    Draw-Text $g $line[1] 265 $y 34 "#333333"
    Draw-Line $g 80 ($y + 68) 1000 ($y + 68) "#e4e4e4" 2
    $y += 90
  }
  Draw-Text $g "检查所见：" 80 735 38 "#333333" ([System.Drawing.FontStyle]::Bold)
  Draw-Line $g 80 810 1000 810 "#e4e4e4" 2
  Draw-Text $g "检查意见：" 80 860 38 "#333333" ([System.Drawing.FontStyle]::Bold)
  $finding = "与本院2025-09-22前片对比：双肺多发微、小结节，大致同前；较大者位于右肺下叶背段，呈实性密度，大小约为6mm×5mm，请随诊；双肺散在钙化灶，右肺门多发钙化灶，大致同前；双侧胸膜略增厚，大致同前。"
  $words = $finding.ToCharArray()
  $line = ""
  $yy = 940
  foreach ($ch in $words) {
    $line += $ch
    if ($line.Length -ge 28) {
      Draw-Text $g $line 80 $yy 34 "#777777"
      $line = ""
      $yy += 48
    }
  }
  if ($line) { Draw-Text $g $line 80 $yy 34 "#777777" }
  Draw-Line $g 80 1260 1000 1260 "#e4e4e4" 2
  Draw-Text $g "报告医师：" 80 1300 34 "#777777"
  Draw-Text $g "测试医师" 265 1300 34 "#333333"
  Draw-Text $g "审核医师：" 80 1370 34 "#777777"
  Draw-Text $g "审核医师" 265 1370 34 "#333333"
  Draw-Text $g "报告日期：" 80 1440 34 "#777777"
  Draw-Text $g "2025-12-24" 265 1440 34 "#333333"
  Draw-Text $g "此报告仅作参考，以医院实际纸质报告为准" 70 1580 32 "#777777"
  $g.Dispose()
  Save-Png $c.Bitmap "synthetic_chest_ct.png"
  Write-Golden "synthetic_chest_ct" @{
    caseId = "synthetic_chest_ct"; status = "structured"; modality = "imaging"
    basicInfo = @{ hospital = "北京协和医院"; reportDate = "2025-12-24"; examDate = "2025-12-22"; type = "胸腹盆CT平扫" }
    findings = @(
      "双肺多发微、小结节，大致同前",
      "右肺下叶背段，呈实性密度，大小约为6mm×5mm",
      "双肺散在钙化灶，右肺门多发钙化灶",
      "双侧胸膜略增厚"
    )
    expectedFields = @("hospital", "reportDate", "examPart", "findings", "comparison")
  }
}

New-ActhImage
New-ThyroidImage
New-BiochemImage
New-CtImage

$manifest = @{
  sourceDir = "./images"
  cases = @(
    @{ id = "synthetic_acth"; file = "synthetic_acth.png"; modality = "laboratory"; expectedGolden = "./golden/synthetic_acth.json" },
    @{ id = "synthetic_thyroid"; file = "synthetic_thyroid.png"; modality = "laboratory"; expectedGolden = "./golden/synthetic_thyroid.json" },
    @{ id = "synthetic_biochem_lipid"; file = "synthetic_biochem_lipid.png"; modality = "laboratory"; expectedGolden = "./golden/synthetic_biochem_lipid.json" },
    @{ id = "synthetic_chest_ct"; file = "synthetic_chest_ct.png"; modality = "imaging"; expectedGolden = "./golden/synthetic_chest_ct.json" }
  )
}
Write-JsonNoBom (Join-Path $OutRoot "manifest.json") $manifest 8

Write-Host "Synthetic OCR fixtures generated at $OutRoot"
