# 投票机制分析 & 未来优化方向

> **文档状态**: Draft (仅分析记录，本期不实现)  
> **模块**: 投票/共识算法  
> **最终位置**: `MultiAI-Answer-cx/docs/05-voting-analysis.md`

---

## 1. 当前投票机制完整分析

### 1.1 算法位置

`src/content/question/handlers/answerHandler.js` → `updateFinalAnswer()` 函数 (第 525-627 行)

### 1.2 算法流程

```
Step 1: 收集
  - 遍历所有启用的 AI
  - 从 DOM 中读取每个 AI 的答案文本
  - 跳过仍在 loading 的 AI
  - 记录答案文本 + 权重 (weight)

Step 2: 统计
  - 将答案转为小写 (大小写不敏感)
  - 按答案内容分组计数
  - 记录每组: 出现次数 (count) + 累计权重 (weight) + 原始形式

Step 3: 选择
  IF 存在多个 AI 给出相同答案:
    → 选出现次数最多的
    → 次数相同时选累计权重高的
  ELSE IF 所有答案都不同 (maxCount === 1):
    → 选权重最高的单个 AI 的答案

Step 4: 渲染
  - 创建可编辑的最终答案组件
  - 用户可手动修改
```

### 1.3 权重系统

| 特性 | 当前实现 |
|---|---|
| **权重范围** | 1 或 2 (二元) |
| **默认高权重 AI** | DeepSeek (weight=2) |
| **修改方式** | UI 下拉菜单，选择一个 AI 设为 weight=2 |
| **约束** | 同时只有一个 AI 可以是 weight=2 |
| **修改权重时** | 所有 AI 重置为 1，被选中的设为 2 |

### 1.4 触发时机

`updateFinalAnswer(questionNum)` 在以下时机被调用:
- 每当一个 AI 返回答案时 (渐进式)
- 删除某个 AI 后
- 修改权重后

**问题**: 最终答案会随着 AI 返回顺序 **跳变**。例如：
1. DeepSeek(权重2) 先返回 "A" → 最终答案 = "A"
2. Kimi 返回 "B" → 最终答案 = "A" (DeepSeek 权重高)
3. 通义返回 "B" → 最终答案 = "B" (2票 vs 1票)
4. 智谱返回 "A" → 最终答案 = "A" (2票+权重3 vs 2票+权重2)

用户会看到最终答案在 A 和 B 之间反复跳动。

---

## 2. 按题型分析投票有效性

### 2.1 单选题 — ✅ 基本有效

**为什么有效**: 答案空间小 (ABCD)，多个 AI 大概率给出相同字母。

**当前问题**:
- AI 可能输出 `"A"` vs `"选A"` vs `"答案是A"` → 正则解析后通常能统一为 `"A"`
- v2 用 JSON 后此问题消除

**投票效果**: 3/4 AI 选 A → A 高置信度

### 2.2 多选题 — ⚠️ 部分有效

**为什么部分有效**: 答案是字母组合，但不同 AI 可能给出不同子集。

**当前问题**:
- `"A;B;C"` vs `"ABC"` vs `"A、B、C"` → 格式差异导致视为不同答案
- 代码中 `.replace(/[^a-zA-Z]/g, '').toUpperCase()` 有一定的格式统一能力
- 但投票仍然是 **全匹配** — `"ABC"` 和 `"AB"` 视为完全不同

**v2 改进方向**: JSON 返回 `["A", "B", "C"]` 数组，可以做子集对比

### 2.3 填空题 — ❌ 基本无效

**为什么无效**: 
- 不同 AI 的措辞差异 → `"80"` vs `"80端口"` vs `"八十"` → 全部视为不同
- 格式差异 → `"第1空：80"` vs `"第1空:80"` → 冒号不同也视为不同

**v2 改进方向**: JSON 返回 `["80"]`，去掉格式包装；语义对比可通过 normalize 实现

### 2.4 判断题 — ✅ 有效

**为什么有效**: 答案空间只有 2 (对/错)

**当前问题**: 
- `"A"` (对) vs `"对"` vs `"√"` → 需要映射
- 代码中有映射逻辑: `A/对/√ → true`, `B/错/× → false`

**v2 改进**: JSON 统一为 `"对"` 或 `"错"`

### 2.5 简答题 — ❌ 完全无效

**为什么无效**: 每个 AI 的自由文本几乎不可能完全相同。

**实际行为**: `maxCount` 永远等于 1 → 直接回退到权重最高的 AI → 其他 AI 的回答被 **完全浪费**。

**数据示例**:
```
DeepSeek (weight=2): "TCP三次握手：1.客户端发SYN 2.服务端回SYN+ACK 3.客户端发ACK"
Kimi (weight=1):     "TCP的三次握手过程如下：首先客户端发送SYN报文..."
通义 (weight=1):     "三次握手是TCP建立连接的过程，包括：第一步..."
```
→ 三个答案完全不同 → 直接选 DeepSeek → Kimi 和通义的答案被丢弃

### 2.6 名词解释 — ❌ 完全无效

与简答题相同的问题。

---

## 3. 核心问题总结

| # | 问题 | 严重度 | 影响范围 |
|---|---|---|---|
| 1 | **纯字符串全匹配** — 语义相同但文字不同视为不同答案 | 🔴 致命 | 填空题, 简答题, 名词解释 |
| 2 | **无语义对比** — 缺乏同义词/等价性判断 | 🔴 致命 | 所有非选择题 |
| 3 | **简答题投票完全失效** — 100% 回退到最高权重 | 🔴 致命 | 简答题, 名词解释 |
| 4 | **渐进式触发导致答案跳变** — 每个 AI 返回都重算 | 🟡 中等 | 所有题型 |
| 5 | **二元权重系统** — 只有 1 和 2，区分度不足 | 🟡 中等 | 投票精度 |
| 6 | **无置信度信号** — 所有答案等权处理 | 🟡 中等 | 投票精度 |
| 7 | **多选题全匹配** — "ABC" 和 "AB" 视为完全不同 | 🟡 中等 | 多选题 |
| 8 | **填空题格式敏感** — 冒号类型差异影响比较 | 🟡 中等 | 填空题 |

---

## 4. v2 基础改进 (本期实施)

虽然投票算法优化不纳入本期，但 **JSON 格式化本身就带来基础改进**：

### 4.1 JSON 带来的自动收益

| 改进 | 原因 |
|---|---|
| 选择题 100% 可比 | `"A"` vs `"A"` — JSON 强制格式统一 |
| 多选题数组对比 | `["A","B","C"]` — 可排序后比较 |
| 判断题统一 | `"对"` 或 `"错"` — 消除映射问题 |
| 填空题按空分组 | `["80", "TCP"]` — 可逐空对比 |
| 置信度信号 | `confidence: 95` — 可用于加权投票 |

### 4.2 本期投票算法 (最小改进)

v2 本期沿用 v1 的投票逻辑框架，但得益于 JSON：

```typescript
// src/core/voting.ts (v2 本期)

function selectFinalAnswer(
  responses: ProviderResponse[],
  questionNumber: number,
  questionType: QuestionType
): FinalAnswer {
  
  // 收集各 AI 的答案 (已经是结构化的)
  const answers = responses
    .map(r => ({
      provider: r.provider,
      answer: r.answers.find(a => a.id === questionNumber),
      weight: getProviderWeight(r.provider)
    }))
    .filter(a => a.answer != null);
  
  switch (questionType) {
    case QuestionType.SingleChoice:
    case QuestionType.TrueFalse:
      // 直接字符串比较 — JSON 保证格式统一
      return majorityVote(answers);
      
    case QuestionType.MultipleChoice:
      // 排序后比较数组
      return majorityVoteArray(answers);
      
    case QuestionType.FillBlank:
      // 逐空比较 (normalize 后)
      return fillBlankVote(answers);
      
    case QuestionType.ShortAnswer:
    case QuestionType.TermDefinition:
    case QuestionType.Essay:
      // 本期: 使用 confidence 加权选择
      // 未来: 语义相似度对比
      return confidenceWeightedSelect(answers);
  }
}
```

### 4.3 简答题的 confidence 加权 (本期最小方案)

```typescript
function confidenceWeightedSelect(answers): FinalAnswer {
  // 综合分数 = AI 权重 * (confidence / 100)
  // 选分数最高的
  let best = answers[0];
  let bestScore = 0;
  
  for (const a of answers) {
    const confidence = a.answer.confidence ?? 50;  // 默认 50
    const score = a.weight * (confidence / 100);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  
  return {
    questionNumber: best.answer.id,
    answer: best.answer.answer,
    consensusLevel: 'fallback',   // 标记为回退选择
    sources: answers.map(a => ({
      provider: a.provider,
      answer: a.answer.answer,
      weight: a.weight,
      confidence: a.answer.confidence
    }))
  };
}
```

---

## 5. 未来优化方向 (下一期参考)

### 5.1 语义相似度对比

对简答题/名词解释，用以下方法对比不同 AI 的答案：

**方案 A: 关键词提取 + 重叠度**
```
DeepSeek: "TCP三次握手：1.SYN 2.SYN+ACK 3.ACK"
Kimi:     "三次握手：SYN → SYN-ACK → ACK确认"

关键词集合:
  DeepSeek: {TCP, 三次握手, SYN, ACK}
  Kimi:     {三次握手, SYN, ACK, 确认}

重叠度: 3/5 = 60% → 高度相似 → 可以算作"同类答案"
```

**方案 B: 用 AI 做仲裁**
```
将 N 个 AI 的简答题答案发给一个"仲裁 AI"：
"以下 3 个答案回答同一个问题，请选出最准确完整的：
1. [DeepSeek 的答案]
2. [Kimi 的答案]
3. [通义 的答案]
返回最佳答案的编号和你的综合改进版本。"
```

**方案 C: 要点分解投票**
```
引导 AI 返回要点列表而非连续文本:
{
  "id": 3,
  "answer": "TCP三次握手...",
  "keyPoints": ["SYN报文", "SYN+ACK确认", "ACK完成连接"]
}

然后对 keyPoints 做投票 — 被多数 AI 提到的要点保留
```

### 5.2 自适应权重

根据历史准确率自动调整 AI 权重：

```typescript
interface ProviderPerformance {
  providerId: string;
  totalQuestions: number;
  agreedWithMajority: number;  // 与多数答案一致的次数
  accuracy: number;            // 已知正确率 (如果有反馈)
  
  get dynamicWeight(): number {
    return baseWeight * (this.agreedWithMajority / this.totalQuestions);
  }
}
```

### 5.3 题型感知投票

不同题型使用不同的投票策略：

| 题型 | 策略 | 理由 |
|---|---|---|
| 选择题 | 多数投票 + 权重打破平局 | 答案空间有限，投票有效 |
| 判断题 | 多数投票 | 二选一，投票最有效 |
| 填空题 | 逐空投票 + normalize | 每空独立投票 |
| 简答题 | 要点提取 + 合并 | 文本投票无意义 |
| 名词解释 | 同简答题 | 同上 |

### 5.4 答案跳变解决方案

**方案: 等待所有 AI 响应后一次性投票**

```typescript
// v2 采用完整响应后显示，天然解决跳变问题
// Orchestrator 使用 Promise.allSettled 等待所有 AI
// 全部完成后一次性计算投票结果
// 用户看到的是最终确定的答案，不会跳变
```

---

## 6. 指标与验证

### 6.1 投票有效性指标

| 指标 | 定义 | 目标 |
|---|---|---|
| **选择题一致率** | 最终答案=多数答案的比例 | >95% |
| **简答题覆盖率** | 最终答案包含的要点占所有 AI 要点并集的比例 | >80% (未来) |
| **置信度校准** | confidence 与实际正确率的相关性 | >0.6 (未来) |
| **跳变频率** | 最终答案在 AI 返回过程中变化的次数 | 0 (v2 解决) |

### 6.2 测试建议 (未来)

- 收集 100+ 真实考试题目的标准答案
- 对比多 AI 投票结果 vs 单 AI 结果
- 统计各题型的准确率提升
