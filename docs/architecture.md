# 系统架构

## 运行流程

```text
Content Loader -> Story Graph -> Story Runner -> Presentation
                         ^             |
                         |             v
                    Game State <-> Save Service
```

1. `Content Loader` 读取章节数据并校验引用。
2. `Story Runner` 根据当前节点生成可见文本和可用选择。
3. 玩家选择后，Runner 校验条件，应用效果，再跳转到目标节点。
4. `Game State` 保存变量、旗标、角色关系、当前节点和章节进度。
5. `Save Service` 将状态序列化；表现层只订阅 Runner 输出，不修改状态。

## 建议的核心接口

```text
StoryRunner.start(storyId, state)
StoryRunner.getCurrentScene()
StoryRunner.choose(choiceId)
StoryRunner.canChoose(choiceId)
SaveService.save(slot, state)
SaveService.load(slot)
```

## 状态分层

- `variables`：数值或字符串，例如金币、声望、好感度。
- `flags`：布尔事实，例如是否见过某角色、是否开启支线。
- `relationships`：角色之间或玩家与角色之间的关系值。
- `inventory`：道具数量。
- `progress`：当前章节、节点和已完成节点集合。
