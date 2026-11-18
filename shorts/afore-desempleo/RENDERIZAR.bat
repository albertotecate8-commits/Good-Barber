@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo ERROR: Falta Node.js & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo ERROR: Falta ffmpeg & pause & exit /b 1)
if not exist "audio\mezcla.wav" (echo ERROR: Falta audio\mezcla.wav & pause & exit /b 1)
if not exist node_modules (call npm install || (echo ERROR: npm install & pause & exit /b 1))
if not exist out mkdir out
call npx remotion render src/index.ts Desempleo out/video.mp4 --codec=h264 --crf=16 || (echo ERROR: fallo el render & pause & exit /b 1)
ffmpeg -y -i out/video.mp4 -i audio/mezcla.wav -map 0:v:0 -map 1:a:0 -vf format=yuv420p -c:v libx264 -crf 20 -c:a aac -b:a 192k -shortest -movflags +faststart afore_desempleo.mp4 || (echo ERROR: fallo ffmpeg & pause & exit /b 1)
echo Listo: %cd%\afore_desempleo.mp4
pause
