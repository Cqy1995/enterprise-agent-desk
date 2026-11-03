# 企业知识库与工单助手

这是逐步完成的Agent全栈学习项目。每次练习都服务于同一个最终产品：依据企业知识回答问题、查询工单、澄清信息，并在用户确认后创建工单。

当前阶段：第4课，受限工具循环。本人已验证分类、输出校验、五条真实评测、本地工单查询，以及正常查询和缺编号的真实模型调用。新增D04本地循环演示已由AI验证，待本人运行与解读；网页、数据库与完整生产Agent尚未实现。

## 逐步建设

| 阶段 | 学习与实现 | 阶段产出 |
|---|---|---|
| 1 | 模型请求、messages、Prompt、输出与usage | Node.js命令行练习 |
| 2 | HTTP接口、Vue页面、流式响应 | 能在网页对话 |
| 3 | 工具Schema、校验、多轮工具调用与步数限制 | 查询工单与受控工具循环 |
| 4 | Markdown导入、Embedding、向量检索与引用 | 基础RAG问答 |
| 5 | LangGraph状态、人工确认、持久化与幂等 | 确认后建单与恢复 |
| 6 | MCP、评测、运行记录与部署 | 可演示、可验证的个人项目 |

基础阶段即记录测试样例和失败结果，不等最终阶段才开始验证。第1阶段先用原生fetch观察协议，掌握后才封装模型客户端；模型调用逻辑会被后续后端复用，不把练习脚本直接变成复杂业务服务。

暂不添加多Agent、Python、复杂后台、PDF/OCR或生产微服务架构。

## 当前目录

```text
enterprise-agent-desk/
├── README.md
├── package.json                    # 练习命令，无第三方依赖
├── .env.example                    # 配置样例，不含真实Key
├── .gitignore
├── apps/
│   └── server/
│       └── scripts/
│           ├── 01-model-call.mjs              # 消息预览
│           ├── 02-validate-output.mjs         # 本地校验练习
│           ├── 03-classify-ticket.mjs         # 单条真实调用＋校验
│           ├── 04-evaluate-classification.mjs # 固定答案计分练习
│           ├── 05-evaluate-live.mjs           # 五条真实评测＋报告
│           ├── classification-prompt.mjs      # 共用Prompt
│           ├── classification-validator.mjs  # 输出校验
│           └── model-client.mjs              # 共用API请求
├── evals/
│   ├── classification/cases.json             # 固定输入与预期类别
│   └── reports/                              # 真实运行时生成
└── docs/
    └── learning/
        ├── day01.md               # 第1课任务与记录
        └── day02.md               # 第2课任务与记录
```

## 后续目录规划

以下路径按实际任务逐步创建，目前未实现：

```text
apps/web/                     Vue前端
apps/server/src/llm/          模型调用与响应适配
apps/server/src/routes/       HTTP与流式接口
apps/server/src/tools/        工单业务工具
apps/server/src/agent/        调用循环与LangGraph编排
apps/server/src/rag/          文档入库与检索
apps/server/src/storage/      会话、工单与运行记录
apps/mcp-server/              复用业务工具的MCP服务
data/knowledge/               自编或公开知识文档
docs/architecture/            数据流、设计取舍与限制
```

第1课用.mjs直接运行，减少工具配置；进入正式后端时逐步采用TypeScript，并保留练习作为学习记录。前后端共享类型、monorepo工具等在确有需要时加入。

## 第1课准备

本机已确认Node.js v24.16.0。当前没有第三方依赖，无需npm install。

首次配置且.env尚不存在时，在此项目目录运行：

```bash
cp .env.example .env
```

在编辑器中填写.env里的DEEPSEEK_API_KEY。Key仅放在本地，不写入练习代码、浏览器代码、日志或学习记录。

配置说明：

- DEEPSEEK_BASE_URL：官方服务地址，默认https://api.deepseek.com。
- DEEPSEEK_MODEL：依官方文档与账号可用模型填写；创建目录时官方首次调用示例使用deepseek-flash。
- DEEPSEEK_API_KEY：本人在DeepSeek平台获得的API Key；对话产品登录不等于已有API调用凭据。

执行单条真实模型调用与校验（会使用API额度，不会自动重试）：

```bash
npm run learn:classify -- "公司网络打不开网页"
```

缺少配置时以退出码1结束。配置齐全后发送一次非流式请求，关闭思考模式，输出上限512 Token、客户端超时30秒；打印API返回的Token用量和通过校验的分类结果，不打印Key。流式处理留到后续课程。

仅预览消息，不调用模型：

```bash
npm run learn:day01 -- "公司网络打不开网页"
```

本地规则与固定答案评测，不调用模型：

```bash
npm run learn:day02
npm run learn:eval
```

## 真实批量评测

先查看五条固定样例，不联网：

```bash
npm run learn:eval:live -- --preview
```

正式评测最多串行请求五次，每条一次，不自动重试，使用真实API额度：

```bash
npm run learn:eval:live
```

输入和人工预期位于evals/classification/cases.json；预期类别只用于本地计分，不传入模型。单条与批量调用共用model-client.mjs和消息模板。遇到400/401/402/429停止剩余请求，报告区分请求错误、未执行、输出不合规和分类错误。

报告保存到evals/reports/，包含模型名、Prompt快照和哈希、参数、原始答案、usage、耗时及每条评分。没有返回usage的调用标记未知，已知Token合计不等于完整消耗。报告不保存Key与请求头。

两项分母均为全部计划样例：输出合规率、端到端分类通过率。若有接口错误或未执行项，应同时检查请求覆盖率，不能将这些直接归因于模型分类能力。五条只是开发练习集，不是生产质量或独立保留集评估；这里只比较类别，不判断澄清质量。

## 学习方式

第4课先执行本地模拟，不读.env、不联网：

```bash
npm run learn:loop -- normal
npm run learn:loop -- repair
npm run learn:loop -- repeated
npm run learn:loop -- budget
npm run learn:loop -- not_found
```

normal两次模型响应后结束；repair先返回错误类型，再修正参数；repeated重复错误停止；budget第3轮仍请求工具时停止，不执行该工具、不追加第4轮；not_found作为业务结果回传并总结。响应为预设数据，不说明真实模型必然这样决策。

可复用循环位于apps/server/scripts/tool-loop.mjs，入口08-tool-loop-demo.mjs只提供模拟响应。当前每轮最多一个getTicket，只读，最多3次模型请求、2次工具函数调用；校验失败也会计入工具函数调用，参数不是合法JSON时不会进入函数。最多一次参数修正，不自动重试网络故障或not_found。暂不实现并行、Token/总时间预算、真实模型循环、写入、确认持久化或幂等建单；这些概念已讲解不代表代码已实现。

本地边界验证：npm run test:loop。学习记录见docs/learning/day04.md。

第3课本地工具与模型工具调用：

```bash
npm run learn:tool -- T1001
npm run learn:tool:live -- "帮我查一下T1001现在处理到哪了"
```

learn:tool仅执行本地模拟查询，不联网。learn:tool:live最多产生2次真实模型请求，第一轮让模型选择工具，程序校验并执行后，用tool_call_id配对回传结果；第二轮只允许生成最终回答，不继续调用工具。缺少编号时预期直接追问。所有工单均为自编教学数据，固定模拟用户不代表已实现登录认证。详细学习记录见docs/learning/day03.md。

每次先解释输入、执行步骤、输出和异常，再自己实现一小段。请求帮助时优先要提示和定位方式，确认理解后再参考完整实现。

每完成一课，记录运行结果、失败情况、自己的解释和AI协助范围。能演示不等于能独立实现，未完成的功能不能写入简历作为已完成成果。

## 参考

- DeepSeek首次API调用：https://api-docs.deepseek.com/
- 总学习计划：../面试准备/30天学习计划.md
- 面试题与复习：../面试准备/面试题清单与复习记录.md
