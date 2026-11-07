# skills

本目录存放可被任意 Agent 直接加载的 Skill。

## chaoxing-autofill

超星学习通**作业 / 考试自动作答与填写**的完整执行契约（[SKILL.md](chaoxing-autofill/SKILL.md)）。

- 覆盖作业（work）与考试（exam-ans）两套前端，全部选择器 / 保存函数 / 确认弹层均来自实测（4 份作业 + 1 场 28 题 11 题型考试交卷成功）
- 内置 submitForm 单把手 abort、toggle 反选、写库延迟、UEditor、复合题、拖拽选词等全部踩坑对策与故障排查表
- 双层验证：客户端回读 + reload 后以服务端渲染值为唯一事实

### 用任意 Agent 跑这个 Skill（通用提示词）

把下面模板发给任何带浏览器控制能力的 Agent（ZCode / Codex / Claude Code / Playwright / CDP 均可），
按需替换 `<...>` 部分：

```text
阅读并加载 skill：<本仓库>/skills/chaoxing-autofill/SKILL.md，严格按它执行。
任务：完成我在超星学习通的<作业 | 考试 | 章节测验>。
入口 URL：<粘贴作业/考试链接（必须含 enc 参数，不能自己拼 URL）>
浏览器：用你的浏览器控制能力打开页面。skill 默认 ego-browser，但任何能在
页面上下文执行 JS 的通道都适用（Playwright / CDP / 浏览器扩展 content script），
把 skill 里的 page.evaluate 对应到你的媒介 API，流程与选择器不变。
要求：
1. 账号已在浏览器登录；只操作学习通相关页面，不动我的登录态。
2. 先按 skill §1 识别模块（work / exam-ans），考试先进整卷预览（§2.1）。
3. 按 §4 SOP：先全卷提取 → 离线作答 → 给我「答案表 + 风险题清单」过目。
4. 我确认后才填写。填写按 §7：串行逐动作 + waitSave + 状态感知，不直接改 hidden 字段。
5. 填完按 §8 双层验证（reload 后以服务端渲染值核对），缺口只补缺的部分。
6. 「提交 / 交卷」不可逆——把最终答案表再给我确认一次，我才允许你提交（§9 / §2.4）。
7. 全程给过程日志；结束后交结果页截图（§10）。
```

### 设计说明

- **为什么 skill 本体不写"第一步找哪个按钮"**：入口 URL 带 enc 签名无法枚举，必须由用户会话提供；
  启动协议（要什么输入、先汇报什么）统一收在本 README 的提示词模板里，skill 本体只保留与页面相关的硬契约。
- **执行媒介可替换**：skill 的 API 面只有 `evaluate / goto / screenshot / dialog` 四类，
  对应到 ego-browser、Playwright、CDP、扩展 content script 都是一行映射的事。
- **与本仓库扩展的关系**：扩展是"多模型投票 + 半自动填写"的用户侧工具；本 skill 是"Agent 全程代操作"路线。
  两者共享同一套学习通 DOM 契约，扩展里 `src/content/question-runtime/adapters/` 的选择器演进会同步回 skill。

### 免责声明

仅供学习交流。使用本 skill 产生的任何后果由使用者自行承担，严禁用于违法违规用途。
提交 / 交卷不可逆，务必保留人工确认环节。
