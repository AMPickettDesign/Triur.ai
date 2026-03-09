@echo off
REM Triur.ai - Prepare Embedded Python for Packaging
REM Downloads Python embeddable, installs pip + requirements.

setlocal

set PYTHON_VERSION=3.11.9
set PYTHON_ZIP=python-%PYTHON_VERSION%-embed-amd64.zip
set PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/%PYTHON_ZIP%
set TARGET_DIR=%~dp0..\resources\python
set REQUIREMENTS=%~dp0..\requirements.txt

echo.
echo Triur.ai - Embedded Python Setup
echo Python %PYTHON_VERSION% (Windows x64)
echo.

if exist "%TARGET_DIR%" (
    echo [1/6] Cleaning previous embedded Python...
    rmdir /s /q "%TARGET_DIR%"
)
mkdir "%TARGET_DIR%"

echo [2/6] Downloading Python %PYTHON_VERSION% embeddable...
curl -L -o "%TARGET_DIR%\%PYTHON_ZIP%" "%PYTHON_URL%"
if errorlevel 1 (
    echo ERROR: Failed to download Python.
    exit /b 1
)

echo [3/6] Extracting Python...
powershell -Command "Expand-Archive -Force -Path '%TARGET_DIR%\%PYTHON_ZIP%' -DestinationPath '%TARGET_DIR%'"
del "%TARGET_DIR%\%PYTHON_ZIP%"

echo [4/6] Enabling pip support...
set PTH_FILE=%TARGET_DIR%\python311._pth
if exist "%PTH_FILE%" (
    powershell -Command "(Get-Content '%PTH_FILE%') -replace '#import site', 'import site' | Set-Content '%PTH_FILE%'"
    echo Lib\site-packages>> "%PTH_FILE%"
)

echo [5/6] Installing pip...
curl -L -o "%TARGET_DIR%\get-pip.py" "https://bootstrap.pypa.io/get-pip.py"
"%TARGET_DIR%\python.exe" "%TARGET_DIR%\get-pip.py" --no-warn-script-location
del "%TARGET_DIR%\get-pip.py"

echo [6/6] Installing project dependencies...
"%TARGET_DIR%\python.exe" -m pip install --no-warn-script-location -r "%REQUIREMENTS%"

echo.
echo Done! Embedded Python ready at: %TARGET_DIR%
echo.

"%TARGET_DIR%\python.exe" -m pip list
