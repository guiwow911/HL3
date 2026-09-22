/* =========================================================================
   半条命 3：重返黑山  ——  server.js
   极简静态服务器（只用 Node 内置模块，无需 npm install）
   用法： node server.js  然后浏览 http://127.0.0.1:8123/
   ========================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || '8123', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

const server = http.createServer(function (req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch (e) {
    res.writeHead(400); return res.end('400 Bad Request');
  }
  if (pathname === '/') pathname = '/index.html';

  const file = path.join(ROOT, pathname);
  /* 防止目录穿越 */
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('403 Forbidden');
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + pathname);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': data.length
    });
    res.end(data);
  });
});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用 —— 可能游戏服务器已经在运行了。');
    console.error('直接打开 http://127.0.0.1:' + PORT + '/ 试试；或设置环境变量 PORT 换端口。');
  } else {
    console.error('服务器错误：', e.message);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', function () {
  var os = require('os');
  var ifs = os.networkInterfaces();
  var ips = [];
  for (var name in ifs) {
    var list = ifs[name] || [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
    }
  }
  console.log('');
  console.log('  ===============================================');
  console.log('      半条命 3：重返黑山  ·  本地服务器已启动');
  console.log('  ===============================================');
  console.log('      电脑打开： http://127.0.0.1:' + PORT + '/');
  if (ips.length) {
    console.log('      ---- 手机 / 平板（需连同一个 Wi-Fi）----');
    for (var k = 0; k < ips.length; k++) {
      console.log('      手机打开： http://' + ips[k] + ':' + PORT + '/');
    }
    console.log('      手机端会自动切换为触屏操作（虚拟摇杆 + 触摸转视角）');
  } else {
    console.log('      （未检测到局域网 IP，手机可能无法访问）');
  }
  console.log('      按 Ctrl+C 关闭服务器');
  console.log('');
});
