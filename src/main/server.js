import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContent, root } from './content.js';
import { replay } from '../core/story.js';
import { answerDialogue } from '../core/dialogue.js';

const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
export function createApp(content, config = {}) {
  const limits = new Map();
  let active = 0;
  return http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(400, { error: 'URL 无效' }); }
    if (req.method === 'GET' && pathname === '/api/content') return send(200, content);
    if (req.method === 'GET' && pathname === '/api/health') return send(200, { status: 'ok', mode: config.apiKey ? 'model' : 'local', model: config.apiKey ? config.model : null, timeoutMs: config.timeoutMs ?? 12000 });
    if (req.method === 'POST' && pathname === '/api/dialogue') {
      if (req.headers.origin) {
        try { if (new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: '仅接受同源请求' }); } catch { return send(403, { error: '来源无效' }); }
      }
      if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: '请提交 JSON' });
      const now = Date.now(), ip = req.socket.remoteAddress;
      for (const [key, value] of limits) if (value.until < now) limits.delete(key);
      const bucket = limits.get(ip) ?? { count: 0, until: now + 60000 };
      if (++bucket.count > 20 || active >= 4) return send(429, { error: '对话太频繁，请稍后再试' });
      limits.set(ip, bucket);
      active++;
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16384) { send(413, { error: '请求过大' }); req.resume(); return; }
          chunks.push(chunk);
        }
        let body, state;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); state = replay(content, body.history); } catch { return send(400, { error: '请求或剧情历史无效' }); }
        try { return send(200, await answerDialogue({ content, state, characterId: body.characterId, question: body.question, memory: body.memory, config })); }
        catch (error) { return send(400, { error: error.message }); }
      } catch { if (!res.headersSent) send(400, { error: '读取请求失败' }); }
      finally { active--; }
      return;
    }
    if (req.method !== 'GET') return send(405, { error: '不支持的方法' });
    const publicPath = pathname === '/' ? 'src/presentation/index.html' : pathname.replace(/^\//, '');
    // 仅发布表现层、纯规则引擎和美术资源；.env 与服务端源码不对外开放。
    if (!(publicPath.startsWith('src/presentation/') || publicPath === 'src/core/story.js' || publicPath.startsWith('assets/art/'))) return send(404, { error: '未找到资源' });
    const absolute = path.resolve(root, publicPath);
    if (!absolute.startsWith(path.resolve(root) + path.sep) || publicPath.includes('..') || publicPath.includes('\\') || publicPath.includes(':')) return send(404, { error: '未找到资源' });
    try {
      const bytes = await readFile(absolute);
      res.writeHead(200, { 'Content-Type': `${mime[path.extname(absolute)] ?? 'application/octet-stream'}${['.html', '.css', '.js'].includes(path.extname(absolute)) ? '; charset=utf-8' : ''}`, 'Cache-Control': 'no-cache' });
      res.end(bytes);
    } catch { send(404, { error: '未找到资源' }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const content = await loadContent();
  const config = { apiKey: process.env.AI_API_KEY, apiBase: process.env.AI_API_BASE || 'https://api.openai.com/v1', model: process.env.AI_MODEL || 'gpt-4.1-mini', wireApi: process.env.AI_WIRE_API || 'chat', reasoningEffort: process.env.AI_REASONING_EFFORT || undefined, timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 12000 };
  if (!/^https?:\/\//.test(config.apiBase)) throw new Error('AI_API_BASE 必须是 HTTP(S) 地址');
  if (!['chat', 'responses'].includes(config.wireApi)) throw new Error('AI_WIRE_API 必须是 chat 或 responses');
  if (config.timeoutMs < 1000 || config.timeoutMs > 120000) throw new Error('AI_TIMEOUT_MS 必须为 1000～120000');
  if (config.reasoningEffort && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(config.reasoningEffort)) throw new Error('AI_REASONING_EFFORT 无效');
  const server = createApp(content, config);
  server.requestTimeout = 20000;
  server.listen(Number(process.env.PORT) || 3000, process.env.HOST || '127.0.0.1', () => console.log(`雾港来信 http://${process.env.HOST || '127.0.0.1'}:${server.address().port} · ${config.apiKey ? '模型模式' : '本地检索模式'}`));
}
