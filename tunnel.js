/* =========================================================================
   半条命 3：重返黑山  ——  tunnel.js
   一键把本地游戏暴露到公网，让任何人都能打开浏览器游玩。
   零下载、零注册：用 Windows 自带的 ssh + localhost.run 免费隧道。
   （若 ssh 不可用，自动退回 Cloudflare quick tunnel）
   注意：地址是临时的，只在这台电脑开机且本窗口开着时有效。
   ========================================================================= */
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || '8123', 10);

const C = {
  reset: '\x1b[0m', amber: '\x1b[33m', dim: '\x1b[90m',
  green: '\x1b[32m', cyan: '\x1b[36m', red: '\x1b[31m', bold: '\x1b[1m'
};
const say = (s) => console.log(s);
const line = () => say(C.dim + '  ------------------------------------------------------------' + C.reset);

/* ---------------- 1. 本地服务器 ---------------- */
function checkLocal(cb) {
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 1500 }, (res) => {
    res.resume(); cb(res.statusCode === 200);
  });
  req.on('error', () => cb(false));
  req.on('timeout', () => { req.destroy(); cb(false); });
}

/* ---------------- 2. 公网隧道 ---------------- */
/* 用 ssh 反向隧道：零下载、免注册。localhost.run 会分配一个 https 地址 */
function startSshTunnel(onUrl) {
  const args = [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'),
    '-o', 'ServerAliveInterval=25',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', '80:localhost:' + PORT,
    'nokey@localhost.run'
  ];
  const p = spawn('ssh', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let found = false;
  /* 注意要排掉欢迎横幅里的 https://admin.localhost.run（它出现在真正的隧道地址之前） */
  const re = /https:\/\/(?!admin\.|docs\.|blog\.)([a-z0-9][a-z0-9-]*)\.(?:lhr\.life|localhost\.run)/;
  const scan = (buf) => {
    if (found) return;
    const m = re.exec(buf.toString());
    if (m) { found = true; onUrl(m[0]); }
  };
  p.stdout.on('data', scan);
  p.stderr.on('data', scan);
  return p;
}

/* cloudflared 备用方案（需要下载 ~50MB） */
function startCloudflared(onUrl) {
  const CF = path.join(ROOT, 'cloudflared.exe');
  if (!fs.existsSync(CF)) return null;
  const p = spawn(CF, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:' + PORT],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let found = false;
  const re = /https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/;
  const scan = (buf) => {
    if (found) return;
    const m = re.exec(buf.toString());
    if (m) { found = true; onUrl(m[0]); }
  };
  p.stdout.on('data', scan);
  p.stderr.on('data', scan);
  return p;
}

/* ---------------- 3. 验证公网真的能打开 ---------------- */
function verify(url, cb) {
  let done = false;
  const finish = (code, bytes) => { if (!done) { done = true; cb(code, bytes); } };
  const req = https.get(url + '/index.html', { timeout: 25000 }, (res) => {
    let n = 0;
    res.on('data', (d) => { n += d.length; });
    res.on('end', () => finish(res.statusCode, n));
  });
  req.on('error', () => finish(0, 0));
  req.on('timeout', () => { req.destroy(); finish(-1, 0); });
}

/* ---------------- 主流程 ---------------- */
say('');
say(C.amber + '  ============================================================' + C.reset);
say(C.amber + '   半条命 3：重返黑山  ·  公网分享' + C.reset);
say(C.amber + '  ============================================================' + C.reset);
say('');

let serverProc = null, tunnelProc = null, url = null;

function openTunnel() {
  say(C.dim + '  [3/3] 正在建立公网隧道（ssh → localhost.run，免注册）...' + C.reset);
  tunnelProc = startSshTunnel((u) => { url = u; announce(u); });
  tunnelProc.on('error', () => {
    say(C.amber + '  ssh 不可用，尝试 Cloudflare 隧道...' + C.reset);
    tunnelProc = startCloudflared((u) => { url = u; announce(u); });
    if (!tunnelProc) {
      say(C.red + '  两种隧道都不可用。' + C.reset);
      say('  请确认 Windows 已启用 OpenSSH 客户端：设置 → 应用 → 可选功能 → OpenSSH 客户端');
    }
  });
  tunnelProc.on('exit', (code) => {
    if (!url) say(C.red + '  隧道进程退出（代码 ' + code + '），请重试' + C.reset);
  });
}

function announce(u) {
  say('');
  say(C.cyan + '  ============================================================' + C.reset);
  say(C.bold + C.green + '   公网地址（发给别人就能玩）：' + C.reset);
  say('');
  say('     ' + C.bold + C.amber + u + C.reset);
  say('');
  say(C.cyan + '  ============================================================' + C.reset);
  try {
    const cp = spawn('clip.exe', [], { stdio: ['pipe', 'ignore', 'ignore'] });
    cp.stdin.end(u);
    say(C.dim + '  已复制到剪贴板' + C.reset);
  } catch (e) {}
  say('');
  say(C.dim + '  正在验证公网可访问性（隧道刚建立可能要等十几秒）...' + C.reset);
  verify(u, (code, bytes) => {
    if (code === 200 && bytes > 1000) {
      say(C.green + '  ✔ 验证通过：公网返回 200，首页 ' + bytes + ' 字节' + C.reset);
    } else {
      say(C.amber + '  ! 验证返回 ' + code + '，稍等十几秒再刷新试试' + C.reset);
    }
    say('');
    line();
    say('  · 别人打开这个地址就能玩；手机端会自动切成触屏操作');
    say('  · 地址是' + C.amber + '临时的' + C.reset + '：关掉本窗口、或这台电脑关机/休眠就失效');
    say('  · 想要长期稳定的地址：看 ' + C.amber + '部署到公网.md' + C.reset + ' 的方案 A / B（免费且永久）');
    line();
    say('');
    say(C.dim + '  按 Ctrl+C 停止分享' + C.reset);
  });
}

checkLocal((up) => {
  say(C.green + '  [1/3] 检查云端依赖… 无需下载 ✔' + C.reset);
  if (up) {
    say(C.green + '  [2/3] 本地服务器已在运行' + C.reset);
    openTunnel();
  } else {
    say(C.dim + '  [2/3] 正在启动本地服务器...' + C.reset);
    serverProc = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, stdio: 'ignore' });
    setTimeout(() => {
      checkLocal((up2) => {
        say(up2 ? C.green + '  [2/3] 本地服务器已启动' + C.reset
                : C.amber + '  [2/3] 本地服务器未响应，仍尝试建立隧道' + C.reset);
        openTunnel();
      });
    }, 2200);
  }
});

function shutdown() {
  say('');
  say(C.dim + '  正在关闭隧道...' + C.reset);
  try { tunnelProc && tunnelProc.kill(); } catch (e) {}
  if (serverProc) { try { serverProc.kill(); } catch (e) {} }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
