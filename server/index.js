import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { attachMultiplayer } from './multiplayer.js';
const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
export function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, service: 'Mochi Wilds', purchases: 'sandbox' }));
    }
    if (req.method !== 'GET') {
      res.writeHead(405);
      return res.end();
    }
    try {
      const path = resolve(
        root,
        '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
      );
      if (!path.startsWith(root + sep)) {
        res.writeHead(403);
        return res.end();
      }
      const data = await readFile(path);
      res.writeHead(200, {
        'Content-Type': types[extname(path)] || 'application/octet-stream',
        'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public,max-age=3600',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found. Run npm run build first.');
    }
  });
  const wss = new WebSocketServer({ server, path: '/socket', maxPayload: 4096 });
  attachMultiplayer(wss);
  return { server, wss };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createServer();
  server.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () =>
    console.log('Mochi Wilds → http://localhost:3001'),
  );
}
