# 剧情与人物创作

## 当前世界观

雾港允许居民自愿出售自己的记忆。三年前，试图预测海啸的“潮汐协议”遭遇断电，调查员陆远失踪。玩家收到父亲留下的蓝色晶片，必须在午夜前决定是否接通灯塔。主题是：对亲人的想念能否成为替别人交出记忆的理由？

人物没有隐藏的“绝对正确答案”：林汐强调证据的裂缝，沈砚区分亲见与猜测，回声区分记录与未知。父亲是否仍然在世保持未定，四个结局分别表达公开、保护、等待与盲信的代价。

## 内容入口

- `content/chapters/chapter-01.json`：当前仅加载这一章；新增章节还需修改 loader、章节选择与存档版本策略。
- `content/characters/characters.json`：人物名、角色设定、问候、初始信任与立绘地址。
- `content/locations/locations.json`：地点、主题、场景副标题。
- `content/lore.json`：可引用的事实片段与解锁条件。

## 节点约定

节点 `id` 唯一，使用英文 kebab-case。类型为 `scene / choice / ending`。每个节点必须包含有效的 `location`、非空 `characters` 与 `lines`。`characters` 是此处可交谈的角色，`lines.speaker` 使用角色 ID、`hero` 或 `narrator`。

非结局节点必须有 `choices`，选项 ID 在节点内唯一；`target` 必须存在。结局需要唯一的 `endingId` 和展示用 `endingTitle`，不带选择。

```json
{
  "id": "verify",
  "text": "交叉核验",
  "hint": "需要两条独立证据",
  "target": "verified",
  "conditions": [
    { "op": "flag", "key": "examined-chip", "value": true },
    { "op": "flag", "key": "found-ledger", "value": true }
  ],
  "effects": [ { "op": "setFlag", "key": "verified-records", "value": true } ]
}
```

当前仅支持条件 `flag`（多条件为 AND），效果 `setFlag` 和 `add relationships.<角色ID>`。没有任意表达式执行、脚本字符串、通用深路径写入。若需新运算，应同时更新校验、引擎与测试。

## 线索约定

`id / title / text / keywords / characters` 必填；`requiresFlag` 可选，无旗标表示开局可知的公共背景。线索内容必须区分事实、推测和未知，避免将人物谎言写成可引用的真实世界知识。

玩家手记展示全部已解锁调查线索，人物对话还会限制 `characters` 权限。关键词为显式子串匹配，暂未做分词、语义召回或同义词扩展；可以在 `keywords` 中补充常见问法。

## 每次修改后的检查

```powershell
npm run validate
npm test
npm run eval
```

校验图引用与操作白名单后，状态遍历检查所有节点可达以及所有非结局状态存在出口。它不能判断文笔、事实语义或剧情是否感人，需要人工阅读。
