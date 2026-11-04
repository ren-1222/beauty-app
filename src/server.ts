import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKitClient, KitApiError } from '@tazimagumi/client';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.APP_PORT ?? 5173);
const kit = createKitClient({ baseUrl: process.env.BEAUTY_KIT_URL ?? 'http://127.0.0.1:5180' });

function sendJson(res: ServerResponse, status: number, body: unknown): void { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
async function readJson(req: IncomingMessage): Promise<unknown> { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); return JSON.parse(Buffer.concat(chunks).toString('utf8')); }

async function checkExpression(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readJson(req) as { text?: unknown };
    if (typeof body.text !== 'string' || body.text.trim() === '') { sendJson(res, 400, { error: '文章を入力してください。' }); return; }
    sendJson(res, 200, await kit.expression.check(body.text));
  } catch (error) {
    if (error instanceof KitApiError) { sendJson(res, error.status || 502, { error: error.message, code: error.code }); return; }
    sendJson(res, 400, { error: '入力をJSONとして読めませんでした。' });
  }
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = join(root, requested.replace(/^\/+/, ''));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try { const content = await readFile(file); const ext = extname(file); const type = ext === '.css' ? 'text/css; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8'; res.writeHead(200, { 'content-type': type }); res.end(content); }
  catch { res.writeHead(404); res.end('Not Found'); }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') { try { sendJson(res, 200, await kit.health()); } catch (error) { sendJson(res, 502, { error: error instanceof Error ? error.message : 'キットサーバーに接続できません。' }); } return; }
  if (req.method === 'POST' && url.pathname === '/api/check-expression') { await checkExpression(req, res); return; }
  if (req.method === 'GET') { await serveStatic(url.pathname, res); return; }
  res.writeHead(405, { allow: 'GET, POST' }); res.end();
});
server.listen(port, '127.0.0.1', () => { console.log(`beauty-app: http://127.0.0.1:${port}`); console.log(`kit-server: ${process.env.BEAUTY_KIT_URL ?? 'http://127.0.0.1:5180'}`); });
