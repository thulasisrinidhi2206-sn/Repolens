const fs = require('fs');
const http = require('http');
const path = require('path');

const port = Number(process.env.PORT) || 4173;
const builtDir = path.join(__dirname, 'dist');
const rootDir = fs.existsSync(path.join(builtDir, 'index.html'))
  ? builtDir
  : path.join(__dirname, 'src');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400);
    response.end('Invalid request path');
    return;
  }

  const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(rootDir, requestedPath);
  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!response.headersSent) response.writeHead(500);
      response.end('Unable to read requested file');
    });
    stream.pipe(response);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`RepoLens website available at http://127.0.0.1:${port}`);
});

server.on('error', error => {
  console.error('Unable to start the RepoLens website server:', error);
  process.exitCode = 1;
});
