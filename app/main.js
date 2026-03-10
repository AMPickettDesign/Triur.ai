/**
 * Triur.ai — Main Process
 * Creates the Electron window, manages Python brain server,
 * Ollama lifecycle, and first-run setup.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync, execFile } = require('child_process');
const http = require('http');

let mainWindow = null;
let splashWindow = null;
let tray = null;
let pythonProcess = null;
let ollamaProcess = null;

// ─── Platform Detection ───
const IS_PACKAGED = app.isPackaged;
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

// ─── Path Resolution (dev vs packaged, Windows vs macOS) ───
const TRIUR_ROOT = IS_PACKAGED
  ? path.join(process.resourcesPath)
  : path.join(__dirname, '..');

const PYTHON_EXE = IS_PACKAGED
  ? (IS_WIN
      ? path.join(TRIUR_ROOT, 'python', 'python.exe')
      : path.join(TRIUR_ROOT, 'python', 'bin', 'python3'))
  : (IS_WIN
      ? path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe')
      : path.join(__dirname, '..', 'venv', 'bin', 'python3'));

const SERVER_SCRIPT = IS_PACKAGED
  ? path.join(TRIUR_ROOT, 'src', 'server.py')
  : path.join(__dirname, '..', 'src', 'server.py');

const SERVER_CWD = IS_PACKAGED
  ? path.join(TRIUR_ROOT, 'src')
  : path.join(__dirname, '..', 'src');

const CONFIG_DIR = IS_PACKAGED
  ? path.join(TRIUR_ROOT, 'config')
  : path.join(__dirname, '..', 'config');

// Ollama paths (platform-specific)
const OLLAMA_PATHS = IS_WIN
  ? [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
      'C:\\Program Files\\Ollama\\ollama.exe',
      'ollama'
    ]
  : [
      '/usr/local/bin/ollama',
      path.join(process.env.HOME || '', '.ollama', 'ollama'),
      '/opt/homebrew/bin/ollama',
      '/usr/bin/ollama',
      'ollama'
    ];

const OLLAMA_MODEL = 'dolphin-llama3:8b';
const OLLAMA_INSTALLER_URL = IS_WIN
  ? 'https://ollama.com/download/OllamaSetup.exe'
  : 'https://ollama.com/download/Ollama-darwin.zip';

// ─── Utility: Send IPC to splash window ───
function splashSend(channel, data) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send(channel, data);
  }
}

// ─── Find Ollama ───
function findOllama() {
  for (const p of OLLAMA_PATHS) {
    try {
      if (p === 'ollama') {
        // Check if ollama is in PATH
        execSync('ollama --version', { stdio: 'ignore' });
        return 'ollama';
      }
      if (fs.existsSync(p)) return p;
    } catch (e) { /* not found, try next */ }
  }
  // macOS: check if Ollama.app exists in Applications
  if (IS_MAC) {
    const appPath = '/Applications/Ollama.app/Contents/Resources/ollama';
    if (fs.existsSync(appPath)) return appPath;
  }
  return null;
}

// ─── Start Ollama serve ───
function startOllama(ollamaPath) {
  return new Promise((resolve) => {
    console.log('[Triur.ai] Starting Ollama serve...');
    const spawnOpts = { stdio: 'ignore', detached: true };
    if (IS_WIN) spawnOpts.windowsHide = true;
    ollamaProcess = spawn(ollamaPath, ['serve'], spawnOpts);
    ollamaProcess.unref();

    // Give Ollama a moment to start
    const check = setInterval(() => {
      const req = http.get('http://127.0.0.1:11434/api/tags', (res) => {
        clearInterval(check);
        resolve(true);
      });
      req.on('error', () => { /* not ready yet */ });
      req.setTimeout(1000, () => req.destroy());
    }, 500);

    // Timeout after 15 seconds
    setTimeout(() => {
      clearInterval(check);
      resolve(false);
    }, 15000);
  });
}

// ─── Check if model is pulled ───
function checkModel() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:11434/api/tags', (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const models = (data.models || []).map(m => m.name);
          // Check for model with or without :latest tag
          const hasModel = models.some(m =>
            m === OLLAMA_MODEL || m === OLLAMA_MODEL + ':latest' ||
            m.startsWith(OLLAMA_MODEL.split(':')[0])
          );
          resolve(hasModel);
        } catch (e) { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

// ─── Pull model with progress ───
function pullModel(ollamaPath) {
  return new Promise((resolve, reject) => {
    console.log(`[Triur.ai] Pulling model ${OLLAMA_MODEL}...`);
    const proc = spawn(ollamaPath, ['pull', OLLAMA_MODEL], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      console.log(`[Ollama Pull] ${line}`);
      // Parse progress from output like "pulling abc123... 45%"
      const match = line.match(/(\d+)%/);
      if (match) {
        splashSend('pull-progress', { percent: parseInt(match[1]), status: line });
      } else {
        splashSend('pull-progress', { percent: -1, status: line });
      }
    });

    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      console.log(`[Ollama Pull Err] ${line}`);
      const match = line.match(/(\d+)%/);
      if (match) {
        splashSend('pull-progress', { percent: parseInt(match[1]), status: line });
      }
    });

    proc.on('close', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`Model pull failed with code ${code}`));
    });
  });
}

// ─── Download Ollama installer ───
function downloadOllama() {
  return new Promise((resolve, reject) => {
    const fileName = IS_WIN ? 'OllamaSetup.exe' : 'Ollama-darwin.zip';
    const downloadPath = path.join(app.getPath('temp'), fileName);
    console.log(`[Triur.ai] Downloading Ollama to ${downloadPath}...`);
    splashSend('setup-status', 'Downloading Ollama...');

    const https = require('https');
    const file = fs.createWriteStream(downloadPath);

    function doRequest(url) {
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location);
          return;
        }

        const total = parseInt(res.headers['content-length'] || 0);
        let downloaded = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100);
            splashSend('pull-progress', { percent: pct, status: `Downloading Ollama... ${pct}%` });
          }
        });

        res.on('end', () => {
          file.end();
          resolve(downloadPath);
        });
      }).on('error', (err) => {
        file.end();
        reject(err);
      });
    }

    doRequest(OLLAMA_INSTALLER_URL);
  });
}

// ─── Install Ollama silently ───
function installOllama(installerPath) {
  return new Promise((resolve, reject) => {
    console.log('[Triur.ai] Installing Ollama...');
    splashSend('setup-status', 'Installing Ollama (this may take a moment)...');

    if (IS_WIN) {
      // Windows: NSIS silent installer
      execFile(installerPath, ['/VERYSILENT', '/NORESTART'], (err) => {
        try { fs.unlinkSync(installerPath); } catch (e) { /* ignore */ }
        if (err) {
          console.log('[Triur.ai] Ollama installer error:', err.message);
          setTimeout(() => {
            const found = findOllama();
            if (found) resolve(found);
            else reject(err);
          }, 3000);
        } else {
          setTimeout(() => {
            const found = findOllama();
            resolve(found || OLLAMA_PATHS[0]);
          }, 2000);
        }
      });
    } else {
      // macOS: Unzip and move Ollama.app to /Applications
      const { exec } = require('child_process');
      const tempDir = path.join(app.getPath('temp'), 'ollama-install');
      exec(`mkdir -p "${tempDir}" && unzip -o "${installerPath}" -d "${tempDir}" && cp -R "${tempDir}/Ollama.app" /Applications/ && rm -rf "${tempDir}" "${installerPath}"`, (err) => {
        if (err) {
          console.log('[Triur.ai] Ollama install error:', err.message);
          // Try with open command as fallback (will show Finder)
          exec(`open "${installerPath}"`, () => {
            setTimeout(() => {
              const found = findOllama();
              if (found) resolve(found);
              else reject(new Error('Please install Ollama manually from ollama.com'));
            }, 10000);
          });
        } else {
          setTimeout(() => {
            const found = findOllama();
            resolve(found || '/Applications/Ollama.app/Contents/Resources/ollama');
          }, 2000);
        }
      });
    }
  });
}

// ─── Start Python server ───
function startPythonServer() {
  console.log('[Triur.ai] Starting Python brain server...');
  console.log('[Triur.ai] Python:', PYTHON_EXE);
  console.log('[Triur.ai] Script:', SERVER_SCRIPT);
  console.log('[Triur.ai] CWD:', SERVER_CWD);

  // Set config path for packaged mode
  const env = { ...process.env };
  if (IS_PACKAGED) {
    env.TRIUR_CONFIG_DIR = CONFIG_DIR;
    env.TRIUR_DATA_DIR = path.join(app.getPath('userData'), 'data');
  }

  const spawnOpts = { cwd: SERVER_CWD, env: env };
  if (IS_WIN) spawnOpts.windowsHide = true;

  pythonProcess = spawn(PYTHON_EXE, [SERVER_SCRIPT], spawnOpts);

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Brain] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.log(`[Brain Err] ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Brain] Exited with code ${code}`);
  });
}

// ─── Wait for Python server to respond ───
function waitForServer(maxAttempts = 30) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = setInterval(() => {
      attempts++;
      if (attempts % 10 === 0) {
        console.log(`[Triur.ai] Waiting for brain server... (${attempts}s)`);
        splashSend('setup-status', `Waking up the siblings... (${attempts}s)`);
      }
      const req = http.get('http://127.0.0.1:5000/api/ping', (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.status === 'awake') {
              clearInterval(check);
              console.log(`[Triur.ai] Brain server ready after ${attempts}s`);
              resolve(true);
            }
          } catch (e) { /* not ready */ }
        });
      });
      req.on('error', () => { /* not ready */ });
      req.setTimeout(1000, () => req.destroy());

      if (attempts >= maxAttempts) {
        clearInterval(check);
        resolve(false);
      }
    }, 1000);
  });
}

// ─── Create Splash Window ───
function createSplashWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  splashWindow = new BrowserWindow({
    width: 460,
    height: 340,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());
}

// ─── Create Main Window ───
function createMainWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = Math.round(screenW * 0.65);
  const winHeight = Math.round(screenH * 0.70);

  mainWindow = new BrowserWindow({
    width: Math.max(winWidth, 800),
    height: Math.max(winHeight, 600),
    minWidth: 700,
    minHeight: 500,
    title: 'Triur.ai',
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('window-close', () => mainWindow && mainWindow.close());

  mainWindow.once('ready-to-show', () => {
    // Close splash if it's still open
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ─── Create Tray ───
function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Triur.ai',
      click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        // Save session before quitting
        const req = http.request({
          hostname: '127.0.0.1', port: 5000,
          path: '/api/save', method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, () => { cleanup(); app.quit(); });
        req.on('error', () => { cleanup(); app.quit(); });
        req.write('{}');
        req.end();
      }
    }
  ]);

  tray.setToolTip('Triur.ai');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    }
  });
}

// ─── Cleanup processes ───
function cleanup() {
  if (pythonProcess) { try { pythonProcess.kill(); } catch (e) {} pythonProcess = null; }
  // Don't kill Ollama — it may be shared with other apps
}

// ─── IPC: Splash screen requests ───
ipcMain.handle('get-setup-state', async () => {
  // Check what needs to be done
  const ollamaPath = findOllama();
  const ollamaInstalled = !!ollamaPath;
  let ollamaRunning = false;
  let modelReady = false;

  if (ollamaInstalled) {
    try {
      const req = http.get('http://127.0.0.1:11434/api/tags');
      ollamaRunning = await new Promise((resolve) => {
        req.on('response', () => resolve(true));
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
      });
    } catch (e) { ollamaRunning = false; }

    if (ollamaRunning) {
      modelReady = await checkModel();
    }
  }

  return { ollamaInstalled, ollamaRunning, modelReady, ollamaPath };
});

ipcMain.handle('install-ollama', async () => {
  try {
    const installerPath = await downloadOllama();
    const ollamaPath = await installOllama(installerPath);
    return { success: true, path: ollamaPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('start-ollama', async (event, ollamaPath) => {
  const p = ollamaPath || findOllama();
  if (!p) return { success: false, error: 'Ollama not found' };
  const ok = await startOllama(p);
  return { success: ok };
});

ipcMain.handle('pull-model', async (event, ollamaPath) => {
  const p = ollamaPath || findOllama();
  if (!p) return { success: false, error: 'Ollama not found' };
  try {
    await pullModel(p);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('setup-complete', async () => {
  // Everything ready — start the Python server and main window
  splashSend('setup-status', 'Starting brain server...');
  startPythonServer();

  const serverOk = await waitForServer(90);
  if (!serverOk) {
    dialog.showErrorBox('Triur.ai', 'Could not start the brain server. Please check if Python is working correctly.');
    app.quit();
    return { success: false };
  }

  createMainWindow();
  createTray();
  return { success: true };
});

// ─── App Lifecycle ───
app.whenReady().then(async () => {
  // Show splash screen
  createSplashWindow();
});

app.on('window-all-closed', () => {
  // Don't quit — we live in the tray
});

app.on('before-quit', () => {
  cleanup();
});
