import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { loadContent } from '../src/main/content.js';
import { createApp } from '../src/main/server.js';
const content = await loadContent();
async function withServer(run, config = {}) {
  const app = createApp(content, config);
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  try { await run(`http://127.0.0.1:${app.address().port}`); }
  finally { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
}
test('页面与 API 可用，私有文件和服务端代码不能下载', () => withServer(async base => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('雾港来信'));
  assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.equal((await (await fetch(base + '/api/health')).json()).mode, 'local');
  for (const file of ['/.env', '/src/main/server.js', '/package.json', '/assets/art/..%5c..%5c.env', '/src/presentation/..%2f..%2fmain/server.js']) assert.equal((await fetch(base + file)).status, 404);
}));
test('角色立绘路径可访问并返回 PNG', () => withServer(async base => {
  for (const character of content.characters) {
    const response = await fetch(base + character.portrait);
    assert.equal(response.status, 200, character.id);
    assert.equal(response.headers.get('content-type'), 'image/png', character.id);
    assert.ok((await response.arrayBuffer()).byteLength > 0, character.id);
  }
}));
test('服务端重放历史，拒绝伪造跳转、跨域、错误类型与过大请求', () => withServer(async base => {
  const post = (body, headers = {}) => fetch(base + '/api/dialogue', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const valid = { history: ['read'], characterId: 'lin', question: '父亲的来信写了什么？' };
  const response = await post(valid);
  assert.equal(response.status, 200);
  assert.ok((await response.json()).evidenceIds.includes('letter'));
  assert.equal((await post({ ...valid, history: ['publish'] })).status, 400);
  assert.equal((await post({ ...valid, history: [], flags: { 'read-letter': true } })).status, 200);
  assert.equal((await post(valid, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post(valid, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post({ ...valid, question: 'x'.repeat(17000) })).status, 413);
}));
test('同一来源请求频率受到限制', () => withServer(async base => {
  for (let i = 0; i < 20; i++) assert.equal((await fetch(base + '/api/dialogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
  assert.equal((await fetch(base + '/api/dialogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 429);
}));
test('健康检查公开模型与等待时限，但不泄露密钥或供应商地址', () => withServer(async base => {
  const response = await fetch(base + '/api/health');
  const value = await response.json();
  assert.equal(value.mode, 'model');
  assert.equal(value.model, 'test-codex-model');
  assert.equal(value.timeoutMs, 60000);
  assert.ok(!JSON.stringify(value).includes('test-secret'));
  assert.ok(!JSON.stringify(value).includes('private.example'));
}, { apiKey: 'test-secret', apiBase: 'https://private.example', model: 'test-codex-model', timeoutMs: 60000 }));
