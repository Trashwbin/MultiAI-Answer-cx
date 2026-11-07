# MultiAI Answer

<div align="center">
  <img src="icons/icon.png" alt="MultiAI Answer Logo" width="128">
  <p>基于多模型 AI 投票的学习通智能答题助手</p>
  <p>
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="license">
    <img src="https://img.shields.io/badge/platform-Chrome-blue.svg" alt="platform">
  </p>
</div>

## 🤖 推荐 — Agent Skill 全自动完成作业/考试

不想手动操作？直接把任务丢给 AI Agent。仓库内置 [chaoxing-autofill](skills/chaoxing-autofill/SKILL.md) Skill：
任意带浏览器控制能力的 AI（ZCode / Codex / Claude Code / Playwright / CDP 均可）加载后，
即可**全程代你完成学习通的作业与考试**：

```text
识别页面类型 → 整卷提取 → 离线作答 → 答案表交你确认 → 串行填写
→ 双层验证（reload 后以服务端为准）→ 提交/交卷 → 结果页反查错题
```

**实测战绩**：4 份作业（20 题/份，批量验证 + 提交）+ 1 场考试（28 题 11 种题型），交卷成功页确认。

**沉淀了什么**（每一条都是踩坑换的）：

- 作业（work）与考试（exam-ans）两套前端的完整 DOM 契约、URL 识别与题型差异
- `submitForm` 全局单把手 + 主动 abort 的对策：串行逐动作 + `waitSave` 握手 + 间隔
- 幂等填写（`addChoice` toggle 反选防护）、UEditor 写入回读、复合题 / 共用选项 / 拖拽选词全覆盖
- 双层验证协议：客户端回读只算参考，reload 后服务端渲染值才是唯一事实
- 11 条「症状 → 根因 → 处置」故障排查表

**怎么用** —— 把下面这段发给你的 Agent（替换 `<...>`），它就会自己读 skill、开浏览器、按 SOP 走：

```text
阅读并加载 skill：<本仓库>/skills/chaoxing-autofill/SKILL.md，严格按它执行。
任务：完成我在超星学习通的 <作业 | 考试 | 章节测验>。
入口 URL：<粘贴作业/考试链接（含 enc 参数，不能自己拼）>
浏览器：用你的浏览器控制能力操作页面，能在页面上下文执行 JS 即可
（skill 里的 page.evaluate 对应到你媒介的 API，选择器与流程不变）。
先给我「答案表 + 风险题清单」过目；我确认后再填写；「提交/交卷」前再确认一次。
```

> 完整提示词模板、启动协议与执行媒介适配说明见 [skills/README.md](skills/README.md)。
> 下面的浏览器扩展走「多模型投票 + 半自动填写」路线，两条路线独立可用、共享同一套页面契约。

## 工作原理

在**独立的「模型接入管理」页**里配置一次 API 源（Base URL + API Key），扩展自动拉取可用模型列表并让你勾选启用的模型。之后在学习通页面选定题目直接发送，不再需要任何配置步骤 —— 所有启用模型并行回答，投票聚合出最终答案，支持一键自动填写。

不再依赖任何 AI 网页的登录态或 chat2api 逆向，只走标准 API Key 接入，稳定、可维护。

**支持的接入形态**：任意 OpenAI 兼容接口（官方 API、one-api / New-API 中转、OpenRouter、LiteLLM、Ollama、本机网关等）。扩展不识别也不依赖任何具体产品。

## 功能

- **接入器** — 填 Base URL + API Key → 自动探测接口形态 → 拉取模型列表 → 勾选启用
- **模型元信息** — 展示上下文长度、输出上限、供应商、推理档位、推理/视觉能力标签，并标注来源（端点 / 目录 / 推断）
- **自动探测** — ±`/v1` 自适应、多鉴权头、`/v1/models` 与 `/api/tags` 自动识别
- **能力目录双层** — 随扩展打包 models.dev 离线基线（断网可用）+ 运行时拉取最新覆盖（带 ETag / 24h TTL / CDN 回退）
- **零配置发送** — 配置页勾选的启用模型即为每次发送的目标；「显示AI答案」或「发送选中题目」直接开跑
- **答案面板** — 全屏网格对比各模型回答，支持列显隐、单模型重发、手动编辑最终答案
- **全题型覆盖** — 单选、多选、判断、填空、问答、阅读理解、完形填空等 11 种题型
- **自动填写** — 一键将最终答案填入页面
- **页面增强** — 去水印、解除复制粘贴限制、题目快速复制按钮

## 安装

1. 下载最新 Release 的 `.zip` 文件
2. 解压到本地文件夹
3. 打开 Chrome，进入 `chrome://extensions/`
4. 开启右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

## 使用

1. 点击浏览器工具栏的扩展图标 → 「模型接入管理」（或 `chrome://extensions` → 扩展选项）
2. 点「+ 添加接入源」，填显示名称、Base URL、API Key → 点「拉取模型」
3. 在模型表格里勾选要启用的模型 → 「保存接入源」
4. 进入学习通考试/作业页面（必要时先点「整卷预览」）
5. 点「显示 AI 答案」全部发送，或「显示题目列表」勾选部分题目后「发送选中题目」
6. 等待各模型返回结果，面板自动聚合最终答案；点「自动填写」一键填入

> 配置只做一次。之后每次发题都直接发往全部已启用模型，不再弹出任何配置界面。
> 想换模型集合，回「模型接入管理」改勾选或刷新即可。

### 常见 Base URL 写法

| 接入源 | Base URL 示例 |
|---|---|
| OpenAI 官方 | `https://api.openai.com/v1` |
| 本机网关 / Ollama | `http://127.0.0.1:3425/v1`、`http://localhost:11434` |
| 本地推理服务 | `http://localhost:1234/v1` |
| one-api / New-API 中转 | `https://your-relay.example.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |

带不带 `/v1` 都能自动适配；本机/本地服务的 API Key 通常可留空。
对非 localhost 的自定义域名，扩展会在拉取时请求一次主机权限。

### 能力标签从哪来

优先级：**端点内联字段 > models.dev 目录 > 名字规则推断 > 默认值**。
配置页每个标签会标出来源（端点 / 目录 / 推断 / 默认），「推断」表示按模型名猜测，仅供参考。

- 端点内联：网关返回的 `reasoning`/`modalities`/`context_window`/`supported_reasoning_levels`、OpenRouter 的 `architecture`/`supported_parameters`、Ollama `/api/tags` 的 `capabilities` 等
- models.dev 目录：推理/视觉/上下文精确数据；视觉判定用 `modalities.input` 含 `image`，不用 `attachment`
- 打包基线 + 运行时最新双层，状态显示在配置页底部

## 构建

```bash
npm install
npm run build          # 生成 models.dev 精简基线 + 构建到 dist/
npm run build:catalog  # 仅重新生成 src/data/model-catalog-snapshot.json
npm run typecheck      # 类型检查
npm run package        # 构建 + 打包为 release/MultiAI-Answer-v<版本>.zip
```

`npm run build:catalog` 从 `@opencode-ai/models` 的官方快照派生精简索引（目前约 4200 条 / 520KB）。升级 `package.json` 里该依赖版本后重跑即可更新基线。

## 隐私

- API Key 仅存储在本地 `chrome.storage.local`，不会上传
- 不收集任何个人信息，不记录或上传答题数据
- 请求直接发往你配置的目标端点
- 能力目录会向 `models.dev`（或 jsDelivr CDN）发起公开 GET，不含任何密钥或题目内容；失败时自动使用随扩展打包的离线基线

## 数据来源与许可

模型能力数据来自 [models.dev](https://models.dev)（[MIT](https://github.com/anomalyco/models.dev/blob/dev/LICENSE)），经 `@opencode-ai/models`（MIT）打包为精简快照随扩展分发；生成日期见 `src/data/model-catalog-snapshot.json` 的 `generatedAt` 字段。

## 免责声明

本项目仅供学习交流使用。使用本项目所造成的任何后果由使用者自行承担。严禁用于任何违法违规用途。

## 许可证

[MIT](LICENSE)
