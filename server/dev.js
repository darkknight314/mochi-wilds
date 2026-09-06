import { createServer } from './index.js';
import { createServer as viteServer } from 'vite';
const { server, wss } = createServer();
await new Promise((resolve) => server.listen(3001, '0.0.0.0', resolve));
const vite = await viteServer();
await vite.listen();
vite.printUrls();
async function stop() {
  wss.clients.forEach((s) => s.terminate());
  wss.close();
  server.close();
  await vite.close();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
