$src = "C:\Users\Mr. Sefard\.gemini\antigravity\brain\b34e6527-a1de-41de-8002-1067d6a3e3d5"
$dst = "d:\Pro\WhatsYou\ZIpME"

Copy-Item "$src\hero_illustration_1777190158253.png"  "$dst\img_hero.png"  -Force
Copy-Item "$src\step1_export_1777190175390.png"       "$dst\img_step1.png" -Force
Copy-Item "$src\step2_upload_1777190190200.png"        "$dst\img_step2.png" -Force
Copy-Item "$src\step3_analytics_1777190207831.png"     "$dst\img_step3.png" -Force

Write-Host "Images copied successfully!"
