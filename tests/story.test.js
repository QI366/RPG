import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/main/content.js';
import { initialState, choose, replay, createSave, restoreSave, exploreStory, validateContent, unlockedLore } from '../src/core/story.js';
const content = await loadContent();
export const fullRoute = ['read', 'visit-lin', 'inspect', 'to-tower', 'listen', 'to-archive', 'decode', 'verify', 'to-light'];

test('探索全部状态：没有死路，全部节点与四个结局可达', () => {
  const report = exploreStory(content);
  assert.equal(report.nodes, content.story.nodes.length);
  assert.deepEqual(report.endings.sort(), ['dawn', 'echo', 'letter', 'tide']);
});
test('条件门槛阻止不完整证据公开，原状态不被改变', () => {
  const state = replay(content, ['read', 'visit-shen', 'rush', 'to-workshop', 'keep-chip', 'to-archive', 'decode']);
  assert.throws(() => choose(content, state, 'verify'), /尚未解锁/);
  const lighthouse = choose(content, state, 'proceed');
  assert.throws(() => choose(content, lighthouse, 'publish'), /尚未解锁/);
  assert.equal(state.nodeId, 'protocol');
  assert.equal(choose(content, lighthouse, 'seal').nodeId, 'ending-letter');
});
test('效果应用、两种访问顺序和最佳结局', () => {
  const state = replay(content, fullRoute);
  assert.equal(state.relationships.lin, 2);
  assert.equal(state.relationships.shen, 1);
  assert.equal(state.flags['verified-records'], true);
  assert.equal(choose(content, state, 'publish').nodeId, 'ending-dawn');
  const reverse = replay(content, ['read', 'visit-shen', 'listen', 'to-workshop', 'inspect', 'to-archive', 'decode', 'verify', 'to-light', 'publish']);
  assert.equal(reverse.nodeId, 'ending-dawn');
  assert.equal(reverse.relationships.shen, 2);
});
test('版本化存档往返，忽略伪造旗标，拒绝非法历史和旧版本', () => {
  const state = replay(content, fullRoute);
  const save = JSON.parse(JSON.stringify(createSave(content, state)));
  assert.deepEqual(restoreSave(content, save), state);
  const forged = restoreSave(content, { ...createSave(content, initialState(content)), flags: { 'verified-records': true }, nodeId: 'ending-dawn' });
  assert.deepEqual(forged.flags, {});
  for (const history of [null, {}, ['publish'], Array(65).fill('read'), [1]]) assert.throws(() => replay(content, history));
  assert.throws(() => restoreSave(content, { ...save, version: 99 }));
});
test('线索按剧情旗标和角色权限解锁', () => {
  assert.deepEqual(unlockedLore(content, initialState(content)).map(item => item.id), ['city']);
  const state = replay(content, fullRoute);
  assert.ok(unlockedLore(content, state, 'lin').some(item => item.id === 'fracture'));
  assert.ok(!unlockedLore(content, state, 'shen').some(item => item.id === 'fracture'));
});
test('内容校验拒绝悬空引用、未知运算、重复结局及未知线索旗标', () => {
  for (const corrupt of [
    data => { data.story.nodes[0].choices[0].target = 'missing'; },
    data => { data.story.nodes[0].choices[0].effects[0].op = 'eval'; },
    data => { data.story.nodes[0].choices[0].effects = [{ op: 'add', key: '__proto__.polluted', value: 1 }]; },
    data => { data.story.nodes.at(-1).endingId = 'dawn'; },
    data => { data.lore[0].requiresFlag = 'missing'; }
  ]) { const copy = structuredClone(content); corrupt(copy); assert.throws(() => validateContent(copy)); }
});
