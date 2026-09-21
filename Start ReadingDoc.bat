@echo off
rem Double-click this instead of index.html directly.
rem The neural (Piper) voice needs the page served over http:// to work —
rem opening the .html file directly (file://) breaks its browser storage.
cd /d "%~dp0"
start "ReadingDoc Server - keep this window open" /min cmd /c "python -m http.server 8642"
timeout /t 1 /nobreak >nul
start "" "http://localhost:8642/index.html"
