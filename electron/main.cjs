// Electron main process for the portable desktop build.
// The renderer is the regular Vite bundle (built with a relative base so it
// loads from file://), see config/vite.config.electron.ts.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

// Web Audio must be able to start on the first click without Chromium's
// autoplay heuristics getting in the way.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0a0a0a',
    title: 'Remix Studio',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Keep the in-app window for the app itself; anything else goes to the
  // system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.loadFile(path.join(__dirname, '..', 'dist-electron', 'renderer', 'index.html'));
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
