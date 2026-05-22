// Local dev server — loads .env.local and runs API functions
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load .env.local
const envFile = path.join(__dirname, '.env.local');
fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  req.query = parsed.query;

  // API routes
  if (pathname.startsWith('/api/')) {
    const name = pathname.replace('/api/', '').split('/')[0];
    const handlerPath = path.join(__dirname, 'api', name + '.js');
    if (!fs.existsSync(handlerPath)) {
      return res.writeHead(404).end('Not found');
    }

    // Parse body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch { req.body = {}; }

      // Simple res wrapper
      let statusCode = 200;
      const headers = {};
      const wrappedRes = {
        status(code) { statusCode = code; return wrappedRes; },
        setHeader(k, v) { headers[k] = v; return wrappedRes; },
        json(data) {
          headers['Content-Type'] = 'application/json';
          res.writeHead(statusCode, headers);
          res.end(JSON.stringify(data));
        },
        end(data) { if (!res.headersSent) res.writeHead(statusCode, headers); res.end(data || ''); },
        write(chunk) { if (!res.headersSent) res.writeHead(statusCode, headers); res.write(chunk); },
        writableEnded: false,
      };

      try {
        delete require.cache[require.resolve(handlerPath)];
        const handler = require(handlerPath);
        await handler(req, wrappedRes);
      } catch (e) {
        console.error(e);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      }
    });
    return;
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404); return res.end('Not found');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(3000, () => console.log('Dev server: http://localhost:3000'));
