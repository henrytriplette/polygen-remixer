// Rasterises docs/logo.svg to build/icon.png (512x512) using Electron's own
// renderer, so no extra image tooling is needed. electron-builder turns the
// PNG into the .ico embedded in the Windows executable.
//   yarn electron:icon
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const SIZE = 512;
const root = path.join(__dirname, '..');
const page = path.join(__dirname, 'icon-page.html');
const out = path.join(__dirname, 'icon.png');

// Never leave a zombie renderer behind if something goes wrong.
setTimeout(() => { console.error('make-icon: timed out'); app.exit(1); }, 20000).unref();

app.whenReady().then(async () => {
  fs.writeFileSync(page,
    `<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}` +
    `img{display:block;width:${SIZE}px;height:${SIZE}px}</style>` +
    `<img src="../docs/logo.svg">`);

  const win = new BrowserWindow({
    show: false,
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    transparent: true,
    frame: false,
    webPreferences: { backgroundThrottling: false },
  });
  await win.loadFile(page);
  await win.webContents.executeJavaScript(
    'new Promise(r => { const i = document.querySelector("img"); i.complete ? r() : i.onload = r; })');
  await new Promise((r) => setTimeout(r, 200));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(out, image.toPNG());
  fs.unlinkSync(page);
  console.log('wrote', path.relative(root, out), image.getSize());
  app.exit(0);
});
