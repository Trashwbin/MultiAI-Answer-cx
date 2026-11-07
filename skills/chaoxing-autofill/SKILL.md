---
name: chaoxing-autofill
description: 超星学习通作业/考试自动答题与填写（作业 work 模块与考试 exam-ans 模块均已实测交卷成功）。Use when the operator asks to answer or fill 学习通/Chaoxing homework, exams, or chapter quizzes (mooc1.chaoxing.com work/dowork / work/view pages, chapter quizzes, exam-ans reVersionTestStartNew / preview pages). Executes via ego-browser by default but works with any medium that can run JS in the page context (Playwright, extension content script, CDP).
---

# 学习通作业/考试自动填写

实测跑通的完整链路：4 份作业（20 题/份，批量验证 + 提交）+ 1 场考试（28 题 11 种题型，交卷成功页确认）。
执行媒介默认 ego-browser（`ego-browser nodejs` 跑脚本），任何能在页面上下文执行 JS 的通道同样适用
—— 换媒介只改 API 名，流程与选择器不变。

前提：用户自有账号与作业。**提交不可逆，必须先汇报答案表并获用户确认。**

## 0. 铁律（每一条都是踩坑换的）

1. **服务端是唯一事实**。DOM 里的 hidden 字段只是客户端缓存；「ajax 返回提交成功」也只代表请求送达。
   唯一可信的验证 = 等待 ≥10s 后 **reload 页面**读服务端渲染值。
2. **一次一个动作**。exam-ans 的 `submitForm` 是全局单把手 + 主动 abort（§2.4），
   批量连点/连拖/连保存会互相掐死，实测一次 evaluate 点 28 题只落库 2-3 题。串行 + handshake，宁慢勿丢。
3. **动手前先读状态**。`addChoice` 是 toggle 语义：对已选中项重复点击会**反选清空**已保存的答案。
   点击前检查 `span.check_answer` / hidden 字段，已正确就跳过——填写操作必须幂等。
4. **页面丢了不猜原因**。tab 被导航/关闭、按钮找不到时，直接回原始 URL 重进查状态。
   答案是逐题落库的，丢的只是还没冲刷的部分；重进后以服务端渲染值为准补齐。
5. **长脚本拆块**。ego-browser `page.evaluate` 有 15s 超时；超时的脚本**仍在页面里继续跑副作用**。
   每块控制在 ~12s 内；超时后不要立刻发下一块（两套脚本会并发互踩保存），等 45-60s 让它跑完再查状态。

## 1. 页面类型与 URL 识别

学习通分两个模块：**作业（work）**与**考试（exam-ans）**，路径与前端域名都不同。

作业（mooc1.chaoxing.com，实测）：
```
作答页   /mooc-ans/mooc2/work/dowork?...&workId=<id>&answerId=0&enc=...   ← 填答案在这里
结果页   /mooc-ans/mooc2/work/prompt?...&answerId=<aid>                   ← 提交成功后跳转，显示分数
批改详情 /mooc-ans/mooc2/work/view?...&workId=<id>&answerId=<aid>         ← 每题对错+正确答案+AI讲解
```

考试（mooc1-api.chaoxing.com，exam-ans 模块，实测）：
```
考试列表 /exam-ans/exam/test/examcode/examlist?edition=1&nohead=0&fid=<学校id>
作答页   /exam-ans/exam/test/reVersionTestStartNew?...&tId=<试卷id>&id=<relationId>&enc=...  ← 单题分页
整卷预览 /exam-ans/mooc2/exam/preview?...                          ← 点作答页「整卷预览」跳入，作答主战场
结果页   /exam-ans/exam/test/look?...&examId=<id>&examAnswerId=<id>  ← 交卷成功后 jumpExamLook() 跳入
```
- 列表页/作答页 URL 来自课程内入口跳转；有 enc 签名，直接拼参数猜 URL 不通，从用户给的链接或已开 tab 拿。
- 同一会话可能多份作业/考试并存：用媒介的 tab 列表逐 tab 管理，复用已打开的页面。

## 2. 考试模块（exam-ans）契约

### 2.1 整卷预览优先（28 题一次拉全）

考试作答页是**单题分页**（`getTheNextQuestion(1)` 翻页），逐题翻 N 次才能采完。
**正确路径：进作答页后先点「整卷预览」按钮（onclick `topreview();`）**，28 题全部进同一 DOM：

- 提取一次 evaluate 全卷拉完，不用翻页。
- **预览页可以直接作答并落库**：选项 onclick 是 `saveSingleSelect(this,'<qid>')` / `clickSaveMultiSelect`，
  点击即触发页面自己的保存；文本题有每题「保存」按钮 `saveQuestion(qid, subId)`；交卷按钮 `finalSubmit()`。
- 预览页「返回」可回作答页，两边操作同一份答案，不存在预览只读的问题。

### 2.2 整卷预览页 DOM 契约（实测）

```html
<div id="sigleQuestionDiv_<qid>" class="questionLi scroll_<qid> singleQuesId" data="<qid>">
  <h3 class="mark_name">1. <span class="colorShallow">(单选题, 5.0 分)</span> 题干…</h3>
  <form>… <input type="hidden" name="typeName<qid>" value="单选题">
        <input type="hidden" id="answer<qid>" name="answer<qid>" value="">  ← 落库锚点
    <div class="stem_answer">
      <div class="clearfix answerBg" onclick="saveSingleSelect(this,'<qid>');">
        <span data="D" qid="<qid>" class="saveSingleSelect choice<qid> num_option fl">A</span>
        <div class="fl answer_p">选项文本</div>
```

- 容器**没有 `typename` 属性**（作业作答页有），题型从 `input[name="typeName<qid>"]` 的 value 取。
- 选项字母在 `span[class*="num_option"]`（单选 `num_option`，多选 `num_option_dx`，一个选择器通吃）。
- **`randomOptions=true` 时显示字母 ≠ `data` 字母**（页面打乱显示顺序，`data` 是服务端原始字母）。
  一切匹配按**选项文本**做；落库值以 `#answer<qid>` 为准（存 `data` 字母）。
- 判断题选项 `data="true"/"false"`（显示"对/错"），无乱序。
- **复合题（阅读理解/完型填空）**：每个小题一个 `.stem_answer`，选项行 class 是 **`.hoverDiv`**（不是 answerBg），
  span 的 `qid` 是 `<主qid><小题uuid>` 组合串，onclick 仍传主 qid。
  小题答案落在 `answer{主qid}{小题uuid}` 子字段，保存时 `setStuAnswerOfSomeQues(div)` 组装成
  主字段 JSON `[{"uuid":{"type":0,"answer":"B"}},…]`。
- **共用选项题**：共用备选答案只展示不可点；每个小题在 `.B-answerCon.BType_<qid>[index=N]` 里，
  选项是 `<span choice_name="A" onclick="saveBTypeSelect(this,'<qid>')">`，按 `choice_name` 点。
- **填空题（多空）**：每空一个 UEditor，textarea 落库字段 `answerEditor<qid><n>`（n 从 1）。
- **简答题/名词解释**：单 UEditor 直接绑 `#answer<qid>`。
- **选词填空（type 24，拖拽词库）**：词库 `.blanksBox span[data-choose-name]`，槽位 `.textContent .textTarget`，
  hidden 是 JSON `[{"name":1,"content":""},…]`。合成 HTML5 拖拽：对词 span 发 `dragstart`，
  对槽位发 `dragenter/dragover/drop/dragend`（同一个 `DataTransfer`），hidden 立即更新且槽位显示词文本。
- 题干可能带老师导入时泄漏的答案串（如粘着 "41.A.waterfall…答案:B"）和模板说明文字——是脏数据；
  真题干常在模板文字之后。泄漏答案串可当交叉验证参考，但能否作答以页面可交互元素为准
  （实测有题目导入损坏：中间小题无可交互 UI，题干里泄漏的答案无法填写，只能放弃该部分分）。

### 2.3 exam-ans 保存机制

保存 URL：`/exam-ans/exam/test/preview-save?...`（POST，每题一个请求，参数 = 全局字段 + 该题 `answerModeParam(div)`）。
定义在 `/exam-ans/mooc2/js/exam/stu-preview-exam.js`。

**核心坑：`submitForm` 全局单把手 + 主动 abort**

```js
function submitForm(tempSave, quietSubmit, callBack) {
    if (tempSave) { submitAjaxHandle != null && submitAjaxHandle.abort(); }  // ← 新保存掐死上一个
    ...
    submitAjaxHandle = $.ajax({...});
}
```

**必须串行逐动作保存**，每个动作（点击/拖槽/点保存）之后：

```js
async function waitSave() {
  const t0 = Date.now();
  while (!window.submitAjaxHandle && Date.now() - t0 < 1500) await sleep(60); // 等请求发出
  if (!window.submitAjaxHandle) return 'no-submit';                           // 太快没抓到或没触发
  while (window.submitAjaxHandle && Date.now() - t0 < 9000) await sleep(80);  // 等完成(置null)
  return window.submitAjaxHandle ? 'timeout' : 'done';
}
// 选择题点击后 waitSave；拖拽每槽 waitSave + 1.2s 静默间隔；保存按钮同理。
// 'no-submit' 兜底: submitForm(true, document.getElementById('sigleQuestionDiv_'+qid))
```

- **选词填空**：每拖一槽自动 `getFillinBlanksData(qid, true)` 重建整题 JSON 并 `saveFillinBlanks(qid)`
  （内部仍走 submitForm）→ 同受 abort 影响，逐槽 waitSave + 1.2s。手动重建入口 `getFillinBlanksData(qid, true)`。
- **文本题**：`UE.getEditor(id).setContent(html)` + `editor.sync()` 后点该题「保存」（`saveQuestion(qid, subId)`）。
  编辑器 id：简答/名词 = `answer{qid}`，填空题每空 = `answerEditor{qid}{n}`。
  写入后用 `editor.getContent()` 回读确认，只改 textarea 值不算数。`#teacherBrowseMode=true` 时保存是空操作。
- **多选题**：页面本身有 500ms debounce（连点最后一并提交），点完全部选项后 waitSave 即可覆盖。

### 2.4 交卷流程（实测）

```text
点「交卷」(onclick finalSubmit())
  → DOM 确认层「确认交卷？确定/取消」→ 点层内 .jb_btn_92.confirm（onclick finalSubmit(1)）
  → 可能同时弹原生 confirm（卡住时 page.acceptDialog()）
  → 成功后 jumpExamLook() 跳 /exam-ans/exam/test/look?...
  → 验证：页面显示「交卷成功 + 提交时间 + 允许重考 N 次」（截图留证）
```

## 3. 作业模块（work）契约（实测）

```html
<div class="padBom50 questionLi fontLabel singleQuesId"
     typename="单选题" data="406012500" id="question406012500">
  <h3 class="mark_name">1. <span class="colorShallow">(单选题)</span> 题干…</h3>
  <input type="hidden" id="answer406012500" value="">          ← 答案落库字段（验证锚点）
  <div class="stem_answer qtDetail">
    <div class="clearfix answerBg" onclick="addChoice(this)">
      <span data="A" class="choice406012500 num_option fl">A</span>
      <div class="fl answer_p"><p>选项文本</p></div>
```

- 题容器 `.questionLi`：`typename` = 题型，`data` = qid。判断题选项字母是 `true`/`false`。
- 多选处理函数 `addMultipleChoice`，单选 `addChoice`。章节测验页容器是 `.singleQuesId[data] .TiMu[data]`。
- 题目可能在 iframe 里；部分页面有字体加密（secret-font）需先解码。
- 提交链路：见 §6。

## 4. 标准作业流程（SOP）

```text
① 识别模块与页面类型（§1）→ 考试则先进整卷预览（§2.1）
② dump 一题 outerHTML 校准选择器 → 全卷一次 evaluate 提取（§5）
③ 离线作答，产出答案表 + 风险题清单（§6），交用户过目
④ 用户确认后串行填写：逐题「读状态 → 动作 → waitSave」（§7）
⑤ 双层验证：客户端字段全绿后，等 10s → reload → 服务端渲染值逐题核对；缺口补填再验（§8）
⑥ 交卷（先再要一次用户确认）：作业走 §6 提交链，考试走 §2.4
⑦ 结果页截图留证；「查看详情」反查批改，错题口径沉淀回 §6
```

## 5. 提取（一次往返，批量序列化）

```js
const data = await page.evaluate(() =>
  [...document.querySelectorAll('.questionLi')].map((q, idx) => {
    const qid = q.getAttribute('data');
    return {
      n: idx + 1,
      type: q.getAttribute('typename') || q.querySelector(`input[name="typeName${qid}"]`)?.value || '',
      qid,
      stem: (q.querySelector('h3.mark_name')?.textContent || '').replace(/\s+/g, ' ').trim(),
      options: [...q.querySelectorAll('.stem_answer .answerBg, .stem_answer .hoverDiv')].map(o => ({
        letter: o.querySelector('span[class*="num_option"]')?.getAttribute('data') || '',
        text: (o.querySelector('.answer_p')?.textContent || '').replace(/\s+/g, ' ').trim(),
      })),
    };
  })
);
```

**禁止盲猜 class**（会把答题卡数字当选项）。页面版本可能漂移，先 dump 一题 `outerHTML` 校准再写选择器。
快照 ref 不能当自动化契约（刷新即变）。复合题小题选项行是 `.hoverDiv`（上式已兼容）。

## 6. 作答经验（答题侧）

**通用**
- 答案匹配一律用**选项文本**，显示字母只是渲染产物（randomOptions 打乱）。
- 「题目示例：」开头的题是老师导入模板时留下的，**照常计分，照常作答**；真题干常粘在模板文字尾部，提取题干时从尾部找真问题。
- 题干泄漏的答案串（老师录入时粘进来的 "X.选项…答案:Y"）是脏数据，但可用来**交叉验证**自己的推断；不可交互的部分明确告知用户放弃。

**客观题**
- 概念题认准教科书定义：死锁四条件=互斥/请求与保持/不可剥夺/循环等待；IPv4=32 位；HTTP=无状态应用层协议。
- 带限定词的复杂度题要抠字眼：「最坏情况」BST 查找 = O(n)（退化链表），不是 O(log n)。
- 多选题逐项判真伪，警惕绝对化表述（"必须""只能""直接"）——SQL 的 DELETE 不带 WHERE 也能执行这类反例常是干扰项。
- SOLID = SRP/LSP/DIP/ISP/OCP，不含最小权限（PoLP）。

**英语完形/选词填空**
- 先读全文再逐空：空格前后找词性搭配（"rent resources on ___" → demand/on-demand；"most ___ issues" → pressing）。
- 词库通常多 2 个干扰词，全部填完回头复查未用词是否更优。
- 固定搭配优先：on-demand、lack of transparency、tracked silently/passively、introduce strict regulations。
- 两个候选都通顺时标记为风险题（如 silently vs passively），交给用户裁决。

**主观题（简答/名词解释/填空）**
- **写满写全**，分点结构（①②③）：定义 + 核心特征 + 对比/例子。主观题多写不扣分，空着必扣。
- 名词解释公式：全称 + 类别 + 机制 + 特性 + 典型例子。
- 填空题按空数给答案，多个空的内容一一对应，别挤在一格里。

**风险题处理**
- 教材口径有分歧的（复杂度口径、线程共享范围、模型对应关系、流程顺序）→ 标注我的选择 + 备选项 + 理由，**提交前交用户裁决**。
- 提交后用 view/look 页真实批改校准口径，把结论沉淀回本节。

## 7. 填写（填写侧，幂等 + 串行）

**通用协议**：匹配一律按选项文本；点击前检查状态（`span.check_answer` 或 hidden 字段已含目标字母 → 跳过）；
作业页走 `addChoice(this)` 入口，考试预览页走 `saveSingleSelect`/`clickSaveMultiSelect`/`saveBTypeSelect` 入口
——都**不直接改 hidden 字段**（会让高亮/互斥/内部状态与应用脱节）。

```js
// 状态感知点击（考试预览页；作业页把 .hoverDiv 去掉、handler 换 addChoice 即可）
async function fillChoice(qid, wantTexts, mode) { // mode: 'single' | 'multi'
  const q = document.querySelector(`.questionLi[data="${qid}"]`);
  const rows = [...q.querySelectorAll('.stem_answer .answerBg, .stem_answer .hoverDiv')];
  const stored = document.getElementById('answer' + qid)?.value || '';
  for (const w of wantTexts) {
    const row = rows.find(r => norm(r.querySelector('.answer_p')?.textContent) === w);
    const letter = row?.querySelector('span[class*="num_option"]')?.getAttribute('data');
    if (!row || (mode === 'single' ? stored === letter : stored.includes(letter))) continue; // 已选中，跳过
    row.click();                            // 单选逐个 waitSave；多选连点后统一 waitSave
  }
}
```

分题型速查：

| 题型 | 动作 | 保存 |
|---|---|---|
| 单选/判断 | 按文本点 `.answerBg`（判断 want=`true`/`false`） | 每次 click 自带 submitForm，waitSave |
| 多选 | 逐项点 `.answerBg`（toggle，只点未选中的） | 点完统一 waitSave（页面 500ms debounce） |
| 复合题小题 | 按小题区域+文本点 `.hoverDiv` | 每小题 click 自带保存，waitSave |
| 共用选项 | `.B-answerCon[index=N]` 内按 `choice_name` 点 | 每次 click 自带保存，waitSave |
| 填空题 | `UE.getEditor('answerEditor{qid}{n}').setContent() + sync()` | 点该题「保存」按钮，waitSave |
| 简答/名词 | `UE.getEditor('answer{qid}').setContent(分段`<p>`) + sync()` | 点「保存」，waitSave |
| 选词填空 | 合成 DragEvent 逐槽拖入（已对的槽跳过） | 每槽自动保存：waitSave + 1.2s |

## 8. 验证（双层验证，不信任何单层）

- **第一层（填写中）**：每个动作后 `waitSave()` + 回读 hidden 字段；`stored` 不含目标 → 重试一次，仍败停下来人工看。
- **第二层（提交前，唯一可信）**：`sleep 10s` → `goto(当前URL)` 强刷 → 逐题读**服务端渲染值**核对答案表。
  复合题读 `answer{qid}{uuid}` 子字段，选词填空 parse 主字段 JSON。
- 客户端全绿但服务端有缺口 → 只补缺口（状态感知，已正确的别碰），补完再等 10s 重验。
- 截图（`screenshot({ path, fullPage: true })`）只是给人看的确认，不是验证。

## 9. 提交（用户确认后执行）

作业（work）：
```text
点「提交」(role:button[name*="提交"])
  → 原生 confirm：page.acceptDialog() 接受
  → DOM 确认层「确认提交?」：点层内 .jb_btn.jb_btn_92「提交」
  → 可能再弹原生 confirm，同上接受
  → 验证：URL 跳到 work/prompt + 页面含分数（如 "95分 提交时间… 允许重做 3次"）
```

考试（exam-ans）：见 §2.4。「暂时保存」可逆可随时点；「提交/交卷」前必须把答案表 + 风险题亮给用户确认。

## 10. 结果反查与重做

- 结果页点「查看详情」进 view 页；逐题抓 `我的答案 / 正确答案 / 得分` 定位错题。
- **用真实批改校准教材口径**，把新口径结论沉淀回 §6。
- 页面提示「允许重做/重考 N 次」时可重做：改错题答案再提交一次（作业实测 95→可重做路径；
  考试实测存在允许重考 999 次的——但重考前一律按不可逆对待，先确认次数）。

## 11. 故障排查表（症状 → 根因 → 处置）

| 症状 | 根因 | 处置 |
|---|---|---|
| 批量填写后 reload，大部分题为空 | `submitForm` abort 冲突，后面的保存掐死前面的 | 串行逐动作 + `waitSave` handshake + 1.2s 间隔（§2.3） |
| 刷新后某题答案"丢了" | ① 写库延迟（reload 抢跑）② 被自己反选清空 | 先等 10s 再刷一次；仍无则状态感知补点，勿盲目重填 |
| 保存请求发出、响应"提交成功"，服务端却是旧值 | 写库异步滞后 | 等 10-15s 再 reload 验证 |
| 复合题保存成功但服务端空 | 小题点击瞬间子字段尚未写入，请求携带空 payload | 逐小题点击 + 各自 waitSave，最后补一次干净 submitForm |
| `page.evaluate` 超时（15s） | 脚本太长 | 拆成 ≤12s 的小块；超时脚本仍在页面跑，等 45-60s 再发下一块 |
| 交卷按钮/保存函数找不到 | 页面被导航/关闭（切屏监控、误操作、崩溃） | 回原始 URL 重进，按服务端状态补齐，勿重放盲点 |
| 重复点击后单选/多选变空 | `addChoice` 是 toggle 语义 | 点击前状态感知：已选中即跳过（§7） |
| 选词填空拖了但只落库前 1-2 槽 | 每槽自动保存互相 abort | 逐槽拖 + 每槽 waitSave + 1.2s（实测 18 槽逐槽补齐成功） |
| 验证读到的复合题子字段为空但选项高亮在 | 读了主字段（空），子答案在 uuid 子字段 | 读 `answer{qid}{uuid}` 子字段，主字段 JSON 仅参考 |
| UEditor 内容刷新后消失 | 只改了 textarea 没进编辑器实例 | `UE.getEditor(id).setContent()` + `getContent()` 回读 + `sync()` |

## 12. 已知坑（补充速查）

1. 判断题 data 属性是 `true`/`false` 字符串。
2. 提交确认同时存在原生 dialog 与 DOM 弹层，两个都要处理。
3. 作答页 `answerId=0`；带 answerId 的 view 是批改页，别在 view 页找填写入口。
4. dowork 提交按钮有两个（卡片 `.completeBtn` 与弹层 `.jb_btn`），要点顺序：先页面级后弹层级。
5. full_page 截图参数是 `fullPage: true`（ego-browser/Playwright 同名），不是 `scope`。
6. 长截图前确认页面是 view 批改页（含"我的答案/正确答案"），dowork 作答页没有答案可截。
7. 考试与作业风险等级不同：考试通常限时，交卷前必须逐题服务端验证 + 用户确认；
   是否可重做以页面提示为准，看不到"允许重做/重考"时按不可重做处理。
8. 考试模块（exam-ans）与作业模块（mooc2/work）是两套前端，选择器、保存/提交函数、确认弹层都不同。
9. 考试开 `randomOptions` 时显示字母与 `data` 字母错位，匹配只认选项文本。
10. 选词填空槽位有 `hasFill` 状态，重复拖同一词会覆盖槽位；拖错先拖走或覆盖，再补正确词。
11. 同一 session 里 exam 作答页与 preview 页的保存函数同名不同实现（preview 版带自动落库），
    在 preview 页操作就不要再跳回作答页点选项，避免两套状态互相干扰。
