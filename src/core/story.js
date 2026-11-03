export function validateContent({ story, characters, locations, lore }) {
  const fail = message => { throw new Error(`剧情校验失败：${message}`); };
  const unique = (items, label) => {
    if (!Array.isArray(items) || !items.length) fail(`${label}为空`);
    const ids = items.map(item => item.id);
    if (ids.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) || new Set(ids).size !== ids.length) fail(`${label} ID 无效或重复`);
    return new Set(ids);
  };
  const nodes = unique(story.nodes, '节点');
  const people = unique(characters, '角色');
  const places = unique(locations, '地点');
  unique(lore, '线索');
  if (!nodes.has(story.startNode)) fail('起始节点不存在');
  const flags = new Set();
  const endings = new Set();
  for (const node of story.nodes) {
    if (!['scene', 'choice', 'ending'].includes(node.type) || !places.has(node.location)) fail(`节点 ${node.id} 类型或地点无效`);
    if (!node.characters?.length || node.characters.some(id => !people.has(id))) fail(`节点 ${node.id} 角色无效`);
    if (!node.lines?.length || node.lines.some(line => !line.text || !['narrator', 'hero', ...people].includes(line.speaker))) fail(`节点 ${node.id} 台词无效`);
    if (node.type === 'ending') {
      if (!node.endingId || endings.has(node.endingId) || node.choices?.length) fail(`结局 ${node.id} 无效`);
      endings.add(node.endingId);
      continue;
    }
    unique(node.choices, `${node.id} 选项`);
    for (const choice of node.choices) {
      if (!choice.text || !nodes.has(choice.target)) fail(`${node.id}/${choice.id} 目标无效`);
      for (const condition of choice.conditions ?? []) {
        if (condition.op !== 'flag' || !/^[a-z][a-z0-9-]*$/.test(condition.key) || typeof condition.value !== 'boolean') fail('条件不在白名单');
      }
      for (const effect of choice.effects ?? []) {
        if (effect.op === 'setFlag' && /^[a-z][a-z0-9-]*$/.test(effect.key) && typeof effect.value === 'boolean') flags.add(effect.key);
        else if (effect.op !== 'add' || !people.has(effect.key?.replace(/^relationships\./, '')) || !effect.key.startsWith('relationships.') || !Number.isFinite(effect.value) || Math.abs(effect.value) > 10) fail('效果不在白名单');
      }
    }
  }
  for (const node of story.nodes) for (const choice of node.choices ?? []) for (const condition of choice.conditions ?? []) if (!flags.has(condition.key)) fail(`未知旗标 ${condition.key}`);
  for (const entry of lore) if (!entry.text || !entry.title || !Array.isArray(entry.keywords) || entry.keywords.some(key => typeof key !== 'string') || !entry.characters?.length || entry.characters.some(id => !people.has(id)) || (entry.requiresFlag && !flags.has(entry.requiresFlag))) fail(`线索 ${entry.id} 无效`);
  return true;
}

export function initialState(content) {
  return { nodeId: content.story.startNode, flags: {}, relationships: Object.fromEntries(content.characters.map(c => [c.id, c.initialRelationship])), history: [], visited: [content.story.startNode] };
}

export function currentNode(content, state) {
  const node = content.story.nodes.find(item => item.id === state.nodeId);
  if (!node) throw new Error('当前剧情节点不存在');
  return node;
}

export function canChoose(choice, state) {
  return (choice.conditions ?? []).every(condition => condition.op === 'flag' && Boolean(state.flags[condition.key]) === condition.value);
}

export function choose(content, state, choiceId) {
  const node = currentNode(content, state);
  const choice = node.choices?.find(item => item.id === choiceId);
  if (!choice || !canChoose(choice, state)) throw new Error('该选择尚未解锁');
  if (state.history.length >= 64) throw new Error('剧情步数超过限制');
  const next = structuredClone(state);
  for (const effect of choice.effects ?? []) {
    if (effect.op === 'setFlag') next.flags[effect.key] = effect.value;
    else if (effect.op === 'add' && effect.key.startsWith('relationships.')) next.relationships[effect.key.split('.')[1]] += effect.value;
    else throw new Error('不支持的剧情效果');
  }
  next.nodeId = choice.target;
  next.history.push(choice.id);
  next.visited.push(choice.target);
  return next;
}

// 存档与 AI 请求只提交选择历史；旗标、关系和进度均由同一规则重放。
export function replay(content, history) {
  if (!Array.isArray(history) || history.length > 64 || history.some(id => typeof id !== 'string' || id.length > 64)) throw new Error('选择历史格式无效');
  return history.reduce((state, id) => choose(content, state, id), initialState(content));
}

export function createSave(content, state) {
  return { version: 1, storyId: content.story.id, history: [...state.history] };
}

export function restoreSave(content, save) {
  if (!save || save.version !== 1 || save.storyId !== content.story.id) throw new Error('存档版本不兼容');
  return replay(content, save.history);
}

export function unlockedLore(content, state, characterId) {
  return content.lore.filter(entry => (!entry.requiresFlag || state.flags[entry.requiresFlag]) && (!characterId || entry.characters.includes(characterId)));
}

export function exploreStory(content) {
  const queue = [initialState(content)], seen = new Set(), reached = new Set(), endings = new Set();
  while (queue.length) {
    const state = queue.pop();
    const key = JSON.stringify([state.nodeId, state.flags, state.relationships]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 10000) throw new Error('剧情状态空间过大或存在无限循环');
    const node = currentNode(content, state);
    reached.add(node.id);
    if (node.type === 'ending') { endings.add(node.endingId); continue; }
    const choices = node.choices.filter(choice => canChoose(choice, state));
    if (!choices.length) throw new Error(`剧情死路：${node.id}`);
    for (const choice of choices) queue.push(choose(content, state, choice.id));
  }
  if (reached.size !== content.story.nodes.length) throw new Error('存在不可达节点');
  return { states: seen.size, nodes: reached.size, endings: [...endings] };
}
