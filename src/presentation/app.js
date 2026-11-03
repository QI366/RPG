import { initialState, currentNode, choose, canChoose, createSave, restoreSave, unlockedLore } from '../core/story.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'fog-harbor.save.v1', ENDINGS_KEY = 'fog-harbor.endings.v1';
const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
let content, state, selected = 'lin', journalTab = 'clues', busy = false, generation = 0, controller, toastTimer;
const conversations = new Map();
const traces = new Map();
let seenEndings = new Set();
let dialogueTimeoutMs = 18000;

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
function persist(silent = true) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(createSave(content, state))); if (!silent) toast('进度已保存在此浏览器'); }
  catch { toast('浏览器无法保存进度，请导出存档'); }
}
function rememberEnding() {
  const node = currentNode(content, state);
  if (!node.endingId) return;
  seenEndings.add(node.endingId);
  try { localStorage.setItem(ENDINGS_KEY, JSON.stringify([...seenEndings])); } catch { /* 进度仍可导出。 */ }
}
function renderJournal() {
  for (const tab of ['clues', 'route', 'endings']) $(tab + '-tab').setAttribute('aria-selected', String(tab === journalTab));
  $('journal').setAttribute('aria-labelledby', journalTab + '-tab');
  $('journal').replaceChildren();
  const clues = unlockedLore(content, state).filter(entry => entry.requiresFlag);
  $('clue-count').textContent = String(clues.length).padStart(2, '0');
  const total = content.lore.filter(entry => entry.requiresFlag).length;
  const percent = Math.round(clues.length / total * 100);
  $('progress-fill').style.width = `${percent}%`;
  $('progress-label').textContent = `${percent}%`;
  if (journalTab === 'clues') {
    if (!clues.length) $('journal').append(make('p', 'empty-note', '手记还是空白的。\n拆开那封信，调查就此开始。'));
    for (const clue of clues) {
      const item = make('details', 'clue');
      item.append(make('summary', '', clue.title), make('span', 'clue-id', `EVIDENCE / ${clue.id.toUpperCase()}`), make('p', '', clue.text));
      $('journal').append(item);
    }
  } else if (journalTab === 'route') {
    state.visited.forEach((id, index) => {
      const node = content.story.nodes.find(item => item.id === id);
      const element = make('div', 'route-step', node.act.split(' / ')[1]);
      element.append(make('small', '', `${String(index + 1).padStart(2, '0')} / ${content.locations.find(item => item.id === node.location).name}`));
      $('journal').append(element);
    });
  } else {
    for (const node of content.story.nodes.filter(item => item.type === 'ending')) {
      const unlocked = seenEndings.has(node.endingId);
      const item = make('div', 'ending-card', unlocked ? `◇ ${node.endingTitle}` : '◇ 尚未抵达的结局');
      item.append(make('small', '', unlocked ? node.act : '重访雾港，尝试另一种选择。'));
      $('journal').append(item);
    }
  }
}

function renderStory() {
  const node = currentNode(content, state), location = content.locations.find(item => item.id === node.location);
  $('scene').dataset.theme = location.theme;
  $('location-name').textContent = location.name;
  $('scene-subtitle').textContent = location.subtitle;
  $('act-short').textContent = node.act.split(' / ')[0];
  const article = $('narrative');
  article.replaceChildren(make('div', 'act-label', node.act));
  article.classList.remove('fade-in');
  requestAnimationFrame(() => article.classList.add('fade-in'));
  if (node.endingTitle) article.append(make('h2', 'ending-title', node.endingTitle));
  for (const line of node.lines) {
    const p = make('p', line.speaker === 'narrator' ? '' : 'speech');
    if (line.speaker !== 'narrator') p.append(make('span', 'speaker', line.speaker === 'hero' ? '你' : content.characters.find(item => item.id === line.speaker).name));
    p.append(make('span', '', line.text));
    article.append(p);
  }
  $('choice-heading').textContent = node.type === 'ending' ? 'THE STORY REMAINS' : 'THE NEXT MOVE';
  $('choice-note').textContent = node.type === 'ending' ? `已收集 ${seenEndings.size} / 4 个结局` : '你的选择会被记住';
  $('choices').replaceChildren();
  if (node.type === 'ending') {
    const button = make('button', 'choice');
    button.append(make('span', 'choice-number', '↺'), make('span', 'choice-copy', '重访雾港，走向另一种明天'), make('span', 'choice-arrow', '→'));
    button.addEventListener('click', restart);
    $('choices').append(button);
  }
  let visibleIndex = 0;
  for (const choice of node.choices ?? []) {
    // 单纯导航只显示当前出口；真正的剧情门槛保留锁定提示。
    if (['workshop-evidence', 'tower-evidence'].includes(node.id) && !canChoose(choice, state)) continue;
    const button = make('button', 'choice');
    button.disabled = !canChoose(choice, state);
    const copy = make('span', 'choice-copy', choice.text);
    if (choice.hint) copy.append(make('small', '', `${button.disabled ? '未解锁 · ' : ''}${choice.hint}`));
    button.append(make('span', 'choice-number', String(++visibleIndex).padStart(2, '0')), copy, make('span', 'choice-arrow', button.disabled ? '◇' : '→'));
    button.addEventListener('click', () => {
      try { state = choose(content, state, choice.id); cancelDialogue(); rememberEnding(); persist(); render(); }
      catch (error) { toast(error.message); }
    });
    $('choices').append(button);
  }
}

function renderCharacter() {
  const node = currentNode(content, state);
  if (!node.characters.includes(selected)) selected = node.characters[0];
  const character = content.characters.find(item => item.id === selected);
  $('character-tabs').replaceChildren();
  content.characters.forEach((item, index) => {
    const tab = make('button', '', item.name);
    tab.id = `person-${item.id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'portrait');
    tab.setAttribute('aria-selected', String(item.id === selected));
    tab.disabled = !node.characters.includes(item.id);
    tab.title = tab.disabled ? '当前场景无法交谈' : `与${item.name}交谈`;
    tab.addEventListener('click', () => { cancelDialogue(); selected = item.id; renderCharacter(); });
    $('character-tabs').append(tab);
    if (item.id === selected) $('portrait-index').textContent = `${String(index + 1).padStart(2, '0')} / ${item.tag.replace('THE ', '')}`;
  });
  $('portrait').dataset.character = selected;
  $('portrait').setAttribute('role', 'tabpanel');
  $('portrait').setAttribute('aria-labelledby', `person-${selected}`);
  const image = $('portrait-image');
  image.hidden = true;
  const imageCharacter = selected;
  image.onload = () => { if (selected === imageCharacter) { image.hidden = false; $('portrait').classList.add('has-art'); } };
  image.onerror = () => { image.hidden = true; $('portrait').classList.remove('has-art'); };
  $('portrait').classList.remove('has-art');
  image.src = character.portrait;
  image.alt = `${character.name}立绘`;
  $('character-tag').textContent = character.tag;
  $('character-name').textContent = character.name;
  $('character-role').textContent = character.role;
  $('character-description').textContent = character.description;
  $('chat-name').textContent = character.name;
  const trust = state.relationships[selected];
  $('relationship-label').textContent = ['初识', '信任', '默契'][Math.min(2, trust)] ?? '初识';
  $('relationship-dots').className = 'relationship-dots';
  $('relationship-dots').textContent = '●'.repeat(Math.max(0, trust)) + '○'.repeat(Math.max(0, 3 - trust));
  $('relationship-dots').setAttribute('aria-label', `信任值 ${trust}`);
  renderChat();
  $('suggestions').replaceChildren();
  const evidence = unlockedLore(content, state, selected);
  for (const clue of evidence.slice(-2)) {
    const button = make('button', '', `关于${clue.title}？`);
    button.type = 'button';
    button.addEventListener('click', () => { $('question').value = `关于${clue.title}，你知道什么？`; $('question').focus(); });
    $('suggestions').append(button);
  }
}

function renderChat() {
  const character = content.characters.find(item => item.id === selected);
  $('chat-log').replaceChildren();
  const messages = conversations.get(selected) ?? [];
  if (!messages.length) $('chat-log').append(make('div', 'chat-message', character.greeting));
  for (const message of messages) {
    const bubble = make('div', `chat-message ${message.role === 'user' ? 'user' : ''}`, message.content);
    if (message.source) bubble.append(make('small', '', message.source));
    $('chat-log').append(bubble);
  }
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
  $('trace-body').replaceChildren();
  const trace = traces.get(selected);
  $('trace-count').textContent = trace ? `${trace.evidenceIds.length} 条引用` : '—';
  if (trace) {
    const reasons = { unconfigured: '未配置 API', timeout: '模型请求超时', 'provider-error': '模型服务不可用', 'invalid-output': '模型返回未通过校验' };
    $('trace-body').append(make('p', '', `${trace.mode === 'model' ? `模型回复 · ${trace.model}` : `本地检索 · ${reasons[trace.reason] ?? '规则模式'}`} / ${trace.latencyMs} ms / 检索 ${trace.retrievedCount} 条`));
    for (const item of trace.evidence.filter(entry => trace.evidenceIds.includes(entry.id))) {
      const block = make('div', 'trace-entry');
      block.append(make('b', '', `[${item.id}] ${item.title}`), make('p', '', item.text));
      $('trace-body').append(block);
    }
    if (trace.uncertain) $('trace-body').append(make('p', '', '回答包含不确定性，请结合原始线索判断。'));
  } else $('trace-body').textContent = '提问后可查看引用线索、回复来源与耗时。';
}

function render() { renderJournal(); renderStory(); renderCharacter(); }
function cancelDialogue() { generation++; controller?.abort(); busy = false; $('send-button').disabled = false; $('send-button').textContent = '↗'; }
function restart() {
  if (state.history.length && currentNode(content, state).type !== 'ending' && !confirm('重新开始会覆盖本轮进度。已收集的结局会保留。继续吗？')) return;
  cancelDialogue(); state = initialState(content); selected = 'lin'; conversations.clear(); traces.clear(); $('question').value = ''; persist(); render();
}

$('chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const question = $('question').value.trim();
  if (!question || busy) return;
  busy = true;
  const turn = generation, characterId = selected;
  const messages = conversations.get(characterId) ?? [];
  const memory = messages.slice(-6).map(({ role, content: text }) => ({ role, content: text.slice(0, 600) }));
  messages.push({ role: 'user', content: question });
  conversations.set(characterId, messages);
  $('question').value = ''; $('send-button').disabled = true; $('send-button').textContent = '…'; renderChat();
  const requestController = new AbortController();
  controller = requestController;
  const timeout = setTimeout(() => requestController.abort(), dialogueTimeoutMs);
  try {
    const response = await fetch('/api/dialogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history: state.history, characterId, question, memory }), signal: requestController.signal });
    const data = await response.json();
    if (turn !== generation) return;
    if (!response.ok) throw new Error(data.error || '对话暂时不可用');
    messages.push({ role: 'assistant', content: data.reply, source: data.mode === 'model' ? '模型回复 · 可展开查看依据' : '本地检索回复 · 非大模型生成' });
    if (messages.length > 20) messages.splice(0, messages.length - 20);
    traces.set(characterId, data);
    renderChat();
  } catch (error) {
    if (turn !== generation) return;
    messages.pop(); $('question').value = question;
    toast(error.name === 'AbortError' ? '连接超时，请重新发送' : error.message); renderChat();
  } finally {
    clearTimeout(timeout);
    if (turn === generation) { busy = false; $('send-button').disabled = false; $('send-button').textContent = '↗'; }
  }
});
$('question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chat-form').requestSubmit(); } });
$('save-button').addEventListener('click', () => persist(false));
$('restart-button').addEventListener('click', restart);
for (const tab of ['clues', 'route', 'endings']) $(tab + '-tab').addEventListener('click', () => { journalTab = tab; renderJournal(); });
$('export-button').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(createSave(content, state), null, 2)], { type: 'application/json' }));
  const anchor = make('a'); anchor.href = url; anchor.download = '雾港来信-存档.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('import-button').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 16384) throw new Error('存档文件过大');
    const restored = restoreSave(content, JSON.parse(await file.text()));
    cancelDialogue(); state = restored; conversations.clear(); traces.clear(); rememberEnding(); persist(); render(); toast('存档已恢复');
  } catch { toast('存档无效或版本不兼容，当前进度已保留'); }
  finally { event.target.value = ''; }
});
$('guide-button').addEventListener('click', () => $('guide').showModal());
$('close-guide').addEventListener('click', () => $('guide').close());
$('begin-button').addEventListener('click', () => $('guide').close());

async function boot() {
  try {
    const response = await fetch('/api/content');
    if (!response.ok) throw new Error('无法载入剧情');
    content = await response.json(); state = initialState(content);
    let restored = false;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { state = restoreSave(content, JSON.parse(raw)); restored = true; }
      const endings = JSON.parse(localStorage.getItem(ENDINGS_KEY) || '[]');
      if (Array.isArray(endings)) seenEndings = new Set(endings.filter(id => content.story.nodes.some(node => node.endingId === id)));
    } catch { toast('旧存档无法恢复，已从序章开始'); }
    rememberEnding(); render();
    if (restored) toast('已续接上次的调查');
    const health = await fetch('/api/health').then(result => result.json());
    if (Number.isFinite(health.timeoutMs)) dialogueTimeoutMs = Math.max(18000, health.timeoutMs + 3000);
    $('mode-badge').textContent = health.mode === 'model' ? 'AI 模型已配置' : '本地检索模式';
    $('mode-badge').title = health.mode === 'model' ? '当前请求若失败会自动回退；实际来源见每条回复' : '规则检索回复，未调用大模型';
  } catch (error) {
    $('main').replaceChildren(make('p', 'fatal', `载入失败：${error.message}。请确认已启动项目，再刷新页面。`));
  }
}
boot();
