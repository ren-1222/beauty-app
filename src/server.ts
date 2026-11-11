import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKitClient, KitApiError } from '@tazimagumi/client';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.APP_PORT ?? 5173);
const kit = createKitClient({ baseUrl: process.env.BEAUTY_KIT_URL ?? 'http://127.0.0.1:5180' });
const MAX_BODY_BYTES = 16 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size >= MAX_BODY_BYTES) throw new RangeError('本文は16KB未満にしてください。');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function asInput(value: unknown): { text: string; ingredients: string; question: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['text', 'ingredients', 'question'].includes(key))) return null;
  if (typeof body.text !== 'string' || typeof body.ingredients !== 'string' || typeof body.question !== 'string') return null;
  if (!body.text.trim() || !body.ingredients.trim() || (body.question.trim() && body.question.trim().length > 4000)) return null;
  if (body.text.length > 8000 || body.ingredients.length > 4000) return null;
  return { text: body.text.trim(), ingredients: body.ingredients.trim(), question: body.question.trim() };
}

async function analyzeProduct(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = asInput(await readJson(req));
    if (!body) { sendJson(res, 400, { error: '商品説明と全成分を入力してください（文章8000字・成分4000字まで）。' }); return; }
    const [expression, ingredients] = await Promise.all([
      kit.expression.check(body.text),
      kit.ingredients.analyze(body.ingredients),
    ]);
    let consultation: Awaited<ReturnType<typeof kit.consultation.ask>> | null = null;
    let consultationError: string | null = null;
    if (body.question) {
      try { consultation = await kit.consultation.ask(body.question); }
      catch (error) {
        if (error instanceof KitApiError && error.status === 503) consultationError = '根拠資料が未設定のため、相談は利用できません。';
        else consultationError = '根拠資料への相談に接続できませんでした。';
      }
    }
    sendJson(res, 200, { expression, ingredients, consultation, consultationError });
  } catch (error) {
    if (error instanceof KitApiError) { sendJson(res, error.status || 502, { error: error.message, code: error.code }); return; }
    if (error instanceof RangeError) { sendJson(res, 413, { error: error.message }); return; }
    sendJson(res, 400, { error: '入力をJSONとして読めませんでした。' });
  }
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = join(root, requested.replace(/^\/+/, ''));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    const content = await readFile(file);
    const ext = extname(file);
    const type = ext === '.css' ? 'text/css; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'content-type': type }); res.end(content);
  } catch { res.writeHead(404); res.end('Not Found'); }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') {
    try { sendJson(res, 200, await kit.health()); }
    catch (error) { sendJson(res, 502, { error: error instanceof Error ? error.message : 'キットサーバーに接続できません。' }); }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/analyze-product') { await analyzeProduct(req, res); return; }
  if (req.method === 'GET') { await serveStatic(url.pathname, res); return; }
  res.writeHead(405, { allow: 'GET, POST' }); res.end();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`beauty-app: http://127.0.0.1:${port}`);
  console.log(`kit-server: ${process.env.BEAUTY_KIT_URL ?? 'http://127.0.0.1:5180'}`);
});
