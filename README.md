# MultiAI Answer

<div align="center">
  <img src="icons/icon.png" alt="MultiAI Answer Logo" width="128">
  <p>基于多模型 AI 投票的学习通智能答题助手</p>
  <p>
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="license">
    <img src="https://img.shields.io/badge/platform-Chrome-blue.svg" alt="platform">
  </p>
</div>

https://github.com/user-attachments/assets/e84fd061-df37-4767-8a38-5fedd8e6e54d

## 工作原理

同时向多个 AI 平台发送题目，通过加权投票聚合出最优答案，支持一键自动填写。

**支持的 AI 平台**：DeepSeek、Kimi、通义千问、智谱清言、豆包、ChatGPT、Grok

## 功能

- **全题型覆盖** — 单选、多选、判断、填空、问答、阅读理解、完形填空、选词填空、共用选项、名词解释等 11 种题型
- **多 AI 投票** — 多个模型并行回答，加权投票选出最佳答案，可自定义各 AI 权重
- **两种回答模式** — 极速回答（无推理直接出答案）/ 详细解析（带分析过程）
- **批量发送** — 所有题目合并为一条 prompt 发送，减少请求次数
- **自动填写** — 一键将最终答案填入页面，模拟人工点击延迟
- **答案面板** — 全屏网格对比各 AI 回答，支持手动编辑最终答案
- **页面增强** — 去水印、解除复制粘贴限制、题目快速复制按钮

## 安装

1. 下载最新 Release 的 `.zip` 文件
2. 解压到本地文件夹
3. 打开 Chrome，进入 `chrome://extensions/`
4. 开启右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

## 使用

1. 进入学习通考试/作业页面，点击「整卷预览」
2. 点击浏览器工具栏的扩展图标
3. 点击「显示 AI 答案」→ 选择要启用的 AI → 确定
4. 等待各 AI 返回结果，面板自动聚合最终答案
5. 点击「自动填写」一键填入

> 使用前需要先登录对应的 AI 平台（在浏览器中打开并登录即可）。

## 构建

```bash
npm install
npm run build        # 构建到 dist/
npm run package      # 构建 + 打包为 release/MultiAI-Answer.zip
```

## 隐私

- 不收集任何个人信息
- 不记录或上传答题数据
- 所有操作均在本地完成
- AI 对话内容仅在对应平台进行

## 免责声明

本项目仅供学习交流使用。使用本项目所造成的任何后果由使用者自行承担。严禁用于任何违法违规用途。

## 许可证

[MIT](LICENSE)
