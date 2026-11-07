# skills

本目录存放可被任意 Agent 直接加载的 Skill。

## chaoxing-autofill

超星学习通**作业 / 考试自动作答与填写**的完整执行契约（[SKILL.md](chaoxing-autofill/SKILL.md)）。

- 覆盖作业（work）与考试（exam-ans）两套前端，全部选择器 / 保存函数 / 确认弹层均来自实测（4 份作业 + 1 场 28 题 11 题型考试交卷成功）
- 内置 submitForm 单把手 abort、toggle 反选、写库延迟、UEditor、复合题、拖拽选词等全部踩坑对策与故障排查表
- 双层验证：客户端回读 + reload 后以服务端渲染值为唯一事实

### 用任意 Agent 跑这个 Skill（通用提示词）

下面这段**原样复制**即可使用：agent 读完 skill 会先向你要作业/考试的入口 URL，
你把链接发过去就行。想限定范围（比如只做某一份作业）在任务一句里补一句即可。

```text
阅读并加载 skill：https://raw.githubusercontent.com/Trashwbin/MultiAI-Answer-cx/main/skills/chaoxing-autofill/SKILL.md
（如果你本地已经有这个仓库，直接读仓库里的 skills/chaoxing-autofill/SKILL.md 即可）。
先完整读一遍，严格按它执行。
任务：完成我在超星学习通上需要完成的作业/考试/章节测验。我现在还没给入口链接——
先向我要作业/考试的入口 URL（URL 带 enc 签名，只能由我提供或从已打开的页面进入，你不能自己拼）。
浏览器：用你的浏览器控制能力打开并操作页面，能在页面上下文执行 JS 即可——
把 skill 里的 page.evaluate 对应到你媒介的 API，选择器与流程不变。
执行要求：
1. 按 skill §1 识别模块（作业 work / 考试 exam-ans），考试先进整卷预览（§2.1）。
2. 按 §4 SOP：全卷提取 → 离线作答 → 先给我「答案表 + 风险题清单」过目，我确认后才开始填写。
3. 填写按 §7：串行逐动作 + waitSave 握手 + 状态感知，不直接改 hidden 字段。
4. 填完按 §8 双层验证：reload 后以服务端渲染值核对，只补缺口。
5. 「提交/交卷」不可逆：把最终答案表再给我确认一次，我明确同意后才提交（§9 / §2.4）。
6. 结束后给结果页截图（§10），并用批改结果校准口径。
我的账号已在浏览器登录；只操作学习通相关页面，不要动我的登录态。
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
