@echo off
title Duta GeoSpasi - Cloud Stream and D1 Bridge
echo ========================================================
echo  Duta GeoSpasi - Otomatisasi Cloud Stream & Tunnel D1
echo ========================================================
echo  Menghubungkan Server Lokal ke Cloudflare D1 (stream.dutamik.id)...
echo  Peta di geospasi.dutamik.id akan langsung aktif otomatis!
echo ========================================================
cd /d "%~dp0"
node start-cloud-stream.js
pause