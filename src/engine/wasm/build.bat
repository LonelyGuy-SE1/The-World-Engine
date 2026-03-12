@echo off
REM Build script for World Engine WASM module
REM Requires Emscripten SDK (emsdk) to be installed and activated

setlocal

REM Find emcc
set EMCC=%USERPROFILE%\emsdk\upstream\emscripten\emcc.bat
if not exist "%EMCC%" (
  echo ERROR: emcc not found at %EMCC%
  echo Please install emsdk: https://emscripten.org/docs/getting_started/downloads.html
  exit /b 1
)

REM Output directory
set OUTDIR=%~dp0..\..\public\wasm
if not exist "%OUTDIR%" mkdir "%OUTDIR%"

REM Source file
set SRC=%~dp0bindings.cpp

echo Building WASM module...
"%EMCC%" "%SRC%" ^
  -I"%~dp0" ^
  -O3 ^
  -s WASM=1 ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s MODULARIZE=1 ^
  -s EXPORT_NAME="WorldEngineModule" ^
  -s ENVIRONMENT=web ^
  -s NO_EXIT_RUNTIME=1 ^
  -s MALLOC=emmalloc ^
  -s INITIAL_MEMORY=67108864 ^
  --bind ^
  -std=c++17 ^
  -flto ^
  -fno-exceptions ^
  -fno-rtti ^
  -DEMSCRIPTEN_HAS_UNBOUND_TYPE_NAMES=0 ^
  -o "%OUTDIR%\engine.js"

if %ERRORLEVEL% NEQ 0 (
  echo BUILD FAILED
  exit /b 1
)

echo Build successful!
echo Output: %OUTDIR%\engine.js
echo Output: %OUTDIR%\engine.wasm
