# Tests

运行 `npm test`：18 项 Node 原生测试，覆盖剧情状态与存档、检索与人物权限、Chat/Responses 模型接口 mock 与失败回退、HTTP 请求限制与私有文件隔离。

`npm run validate` 遍历剧情的有效状态，检查死路与结局可达性。

`npm run eval` 运行 6 条本地规则检索评测，不调用真实模型，也不代表模型语义准确率。
