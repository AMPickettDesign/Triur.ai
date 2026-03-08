/**
 * Triur.ai — Main Process
 * Creates the Electron window, manages system tray,
 * and starts the Python brain server.
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let pythonProcess = null;

// Path to Triur.ai Python backend
const TRIUR_ROOT = path.join(__dirname, '..');
const VENV_PYTHON = path.join(TRIUR_ROOT, 'venv', 'Scripts', 'python.exe');
const SERVER_SCRIPT = path.join(TRIUR_ROOT, 'src', 'server.py');

function startPythonServer() {
  console.log('[Triur.ai] Starting Python brain server...');
  console.log('[Triur.ai] Python path:', VENV_PYTHON);
  console.log('[Triur.ai] Server script:', SERVER_SCRIPT);

  pythonProcess = spawn(VENV_PYTHON, [SERVER_SCRIPT], {
    cwd: path.join(TRIUR_ROOT, 'src'),
    env: { ...process.env }
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Triur.ai Brain] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.log(`[Triur.ai Brain Error] ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Triur.ai Brain] Process exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: 'Triur.ai',
    frame: false,            // Custom title bar (we'll make our own)
    transparent: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false              // Don't show until ready
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Window control IPC handlers
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('window-close', () => mainWindow.close());

  // Show window when ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create a simple tray icon (we'll make a proper one later)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Abi',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        // Save session before quitting
        const http = require('http');
        const req = http.request({
          hostname: '127.0.0.1',
          port: 5000,
          path: '/api/save',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, () => {
          if (pythonProcess) pythonProcess.kill();
          app.quit();
        });
        req.on('error', () => {
          if (pythonProcess) pythonProcess.kill();
          app.quit();
        });
        req.write('{}');
        req.end();
      }
    }
  ]);

  tray.setToolTip('Abi — Personal AI');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  startPythonServer();

  // Give the Python server a moment to start
  setTimeout(() => {
    createWindow();
    createTray();
  }, 3000);
});

app.on('window-all-closed', () => {
  // Don't quit on window close — we live in the tray
});

app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
