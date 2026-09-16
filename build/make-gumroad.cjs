// Renders the Gumroad store images with Electron's own renderer (no extra
// image tooling), the same trick as make-icon.cjs:
//   docs/gumroad/cover.png      1920x1080  (Gumroad cover, >=1280x720)
//   docs/gumroad/thumbnail.png  1200x1200  (Gumroad thumbnail, >=600x600)
// Both PNGs are tagged 72 DPI. Usage:  yarn gumroad:images
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'gumroad');
const logo = '../logo.svg';
const shot = '../studio-beat.png';
const font = '../../public/fonts/doto.woff2';

// Windows clamps a BrowserWindow to the screen, so the page is captured via
// the DevTools protocol with an emulated viewport instead of capturePage().
// 1 CSS px == 1 device px, whatever the desktop's display scaling.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
setTimeout(() => { console.error('make-gumroad: timed out'); app.exit(1); }, 30000).unref();

const base = (w, h) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'Doto';font-weight:400 800;src:url('${font}') format('woff2')}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#000;color:#f4f4f4;
  font-family:'Inter',system-ui,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.stage{position:relative;width:${w}px;height:${h}px;background:#000;overflow:hidden}
.dots{position:absolute;inset:0;background-image:radial-gradient(circle,#1c1c1c 1.6px,transparent 1.8px);
  background-size:28px 28px;background-position:14px 14px}
.dots::after{content:'';position:absolute;inset:0;
  background:radial-gradient(ellipse 70% 80% at 30% 40%,transparent 20%,#000 90%)}
.glow{position:absolute;border-radius:50%;filter:blur(120px);opacity:.28;background:#ff2b32}
.brand{display:flex;align-items:center;gap:22px}
.brand .mark{width:var(--mark);height:var(--mark);border-radius:22%}
.word{font-family:'Doto',monospace;font-weight:800;letter-spacing:.08em;line-height:1;white-space:nowrap}
.word .dot{display:inline-block;width:.42em;height:.42em;border-radius:50%;background:#ff2b32;
  margin-right:.32em;vertical-align:.12em;box-shadow:0 0 18px #ff2b32}
.word .thin{font-weight:500;color:#b9b9b9}
.label{font-family:ui-monospace,'Cascadia Mono',Consolas,monospace;text-transform:uppercase;
  letter-spacing:.22em;color:#8a8a8a}
</style>`;

const cover = base(1920, 1080) + `
<style>
.glow.a{width:900px;height:900px;left:-380px;top:-300px}
.glow.b{width:700px;height:700px;left:1450px;top:700px;opacity:.16}
.copy{position:absolute;left:112px;top:150px;width:720px}
.brand .word{font-size:52px}
h1{margin:64px 0 0;font-size:67px;line-height:1.02;font-weight:800;letter-spacing:-.025em}
h1 em{font-style:normal;color:#ff2b32}
p.sub{margin:30px 0 0;font-size:25px;line-height:1.45;color:#b9b9b9;max-width:640px}
.chips{display:flex;flex-wrap:wrap;gap:12px;margin-top:44px;width:640px}
.chip{border:1.5px solid #383838;border-radius:999px;padding:10px 18px;font-size:19px;color:#e6e6e6;
  background:#0c0c0c;display:flex;align-items:center;gap:10px}
.chip i{width:9px;height:9px;border-radius:50%;background:var(--c)}
.plat{position:absolute;left:112px;bottom:78px;display:flex;align-items:center;gap:26px;font-size:18px}
.plat .label{font-size:15px}
.plat .sep{width:1px;height:20px;background:#383838}
.shot{position:absolute;left:860px;top:128px;width:1360px;border-radius:24px;overflow:hidden;
  border:2px solid #2b2b2b;background:#0c0c0c;
  box-shadow:0 0 0 12px rgba(255,255,255,.025),0 60px 120px -20px rgba(0,0,0,.9),-30px 0 90px -30px rgba(255,43,50,.25)}
.shot img{display:block;width:100%}
</style>
<div class="stage" style="--mark:80px">
  <div class="dots"></div><div class="glow a"></div><div class="glow b"></div>
  <div class="shot"><img src="${shot}"></div>
  <div class="copy">
    <div class="brand"><img class="mark" src="${logo}">
      <div class="word"><span class="dot"></span>REMIX<span class="thin">STUDIO</span></div></div>
    <h1>Drop in one sample.<br>Walk out with <em>a beat.</em></h1>
    <p class="sub">A browser-based sampler / beat machine that sits between a DJ sampler and a drum machine. Slice, stretch, layer drums and bass, run it through effects &mdash; live.</p>
    <div class="chips">
      <span class="chip" style="--c:#f0a050"><i></i>16-step sequencer</span>
      <span class="chip" style="--c:#66d17a"><i></i>Piano roll synth</span>
      <span class="chip" style="--c:#b48be6"><i></i>10 insert effects</span>
      <span class="chip" style="--c:#4fd0e0"><i></i>Mixer &amp; meters</span>
      <span class="chip" style="--c:#ff2b32"><i></i>Smart Remix</span>
      <span class="chip" style="--c:#f4f4f4"><i></i>WAV export</span>
    </div>
  </div>
  <div class="plat"><span class="label">Runs in</span><span>Any modern browser</span>
    <span class="sep"></span><span>Windows portable .exe</span>
    <span class="sep"></span><span>Installable PWA</span></div>
</div>`;

const thumb = base(1200, 1200) + `
<style>
.glow.a{width:900px;height:900px;left:150px;top:150px;opacity:.22}
.dots::after{background:radial-gradient(circle at 50% 42%,transparent 25%,#000 85%)}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.mark{width:520px;height:520px;border-radius:22%;
  box-shadow:0 0 0 14px rgba(255,255,255,.03),0 50px 110px -20px rgba(0,0,0,.95),0 0 120px -20px rgba(255,43,50,.35)}
.word{font-size:96px;margin-top:70px}
.tag{margin-top:34px;font-size:30px;color:#b9b9b9}
.tag b{color:#f4f4f4;font-weight:600}
.tag .sep{color:#ff2b32;margin:0 .45em}
.foot{position:absolute;left:0;right:0;bottom:64px;text-align:center;font-size:19px}
</style>
<div class="stage">
  <div class="dots"></div><div class="glow a"></div>
  <div class="center">
    <img class="mark" src="${logo}">
    <div class="word"><span class="dot"></span>REMIX<span class="thin">STUDIO</span></div>
    <div class="tag"><b>Sampler</b><span class="sep">&middot;</span><b>Beat machine</b><span class="sep">&middot;</span><b>Effects</b></div>
  </div>
  <div class="foot label">Browser &amp; Windows</div>
</div>`;

// --- 72 DPI tag: insert a pHYs chunk (2835 px/m == 72 dpi) after IHDR. ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function withDpi(png, dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0); data.writeUInt32BE(ppm, 4); data[8] = 1;
  const type = Buffer.from('pHYs');
  const len = Buffer.alloc(4); len.writeUInt32BE(9);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // signature + IHDR chunk
  return Buffer.concat([png.subarray(0, ihdrEnd), len, type, data, crc, png.subarray(ihdrEnd)]);
}

async function render(win, name, html, width, height) {
  const page = path.join(outDir, `.${name}.html`);
  fs.writeFileSync(page, html);
  await win.loadFile(page);
  win.webContents.setZoomFactor(1); // zoom levels persist per origin between runs
  const cdp = win.webContents.debugger;
  if (!cdp.isAttached()) cdp.attach('1.3');
  await cdp.sendCommand('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: false });
  await win.webContents.executeJavaScript(`Promise.all([
    document.fonts.ready,
    ...[...document.images].map(i => i.complete ? 1 : new Promise(r => i.onload = r)),
  ])`);
  await new Promise((r) => setTimeout(r, 400));
  const { data } = await cdp.sendCommand('Page.captureScreenshot', {
    format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  const out = path.join(outDir, `${name}.png`);
  fs.writeFileSync(out, withDpi(Buffer.from(data, 'base64'), 72));
  fs.unlinkSync(page);
  console.log('wrote', path.relative(root, out), `${width}x${height}`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  // One offscreen window is reused for every page: a hidden on-screen window
  // stops compositing after its first capture, and a second BrowserWindow in
  // the same process fails to load after the first is destroyed.
  const win = new BrowserWindow({ show: false, width: 800, height: 600,
    webPreferences: { offscreen: true } });
  await render(win, 'cover', cover, 1920, 1080);
  await render(win, 'thumbnail', thumb, 1200, 1200);
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
