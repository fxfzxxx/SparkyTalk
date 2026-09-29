# SparkyTalk

面向新西兰电工行业（tradies）的 AI 优先 CRM / 派工 app。用户：电工小老板（admin）+ 工人（mobile）。

**核心差异化：AI**（语音控制、蓝图解析、AI 报价），以及 **AI 老板秘书**（通知提醒 + 催收要账，重点）。通用 CRM 功能不和 Tradify / Fergus（都是 NZ 本土，成熟）硬拼。

> 当前状态：规划阶段，仓库还没有代码。本文件记录已确定的方向，后续逐步实现。

## 技术栈与部署

```
sparkytalk/  (pnpm + Turborepo monorepo, 全 TypeScript)
├─ apps/mobile   → Expo (React Native)，工人 + 老板外出用。EAS Build 发布到 App Store / Play
├─ apps/admin    → Next.js，老板/办公室桌面后台 → 部署 Netlify
├─ apps/api      → Node + TS (Hono 或 NestJS) → 部署 Railway
└─ packages/
   ├─ shared     → 类型、zod schema、API client、业务规则（两端共享）
   └─ ai         → LLM prompt、tool 定义、结构化输出 schema
```

- admin **不用** RN Web：拖入 PDF、图纸查看、排班日历、大表格在 Web 生态更成熟。共享的是逻辑不是 UI。
- 数据库：Postgres（Railway 自带）。ORM 待定（Drizzle / Prisma）。
- 文件（蓝图 PDF、录音、照片）：S3 兼容对象存储（Cloudflare R2 / S3），不存数据库。
- Auth：待定（Better Auth / Clerk / Supabase Auth）。角色：owner / admin / worker，多租户（按公司隔离）。
- 推送：Expo Push。实时更新：WebSocket / SSE（Railway 支持长连接）。
- 时区一律 `Pacific/Auckland`；货币 NZD，GST 15%。
- 隐私：NZ Privacy Act 2020（注意 IPP 12 跨境传输），部署区域选择时考虑。

## AI 功能设计

### 通用原则
1. **LLM 只做理解和抽取，不做算术**：价格、合计、GST、工时都由代码计算。
2. **所有 AI 产出的写操作都要人确认**：展示确认卡片 / diff，点确认后才落库。
3. 用 **tool calling + 严格 JSON schema**（zod 定义在 `packages/ai`），不解析自由文本。
4. LLM 上下文注入真实数据做实体消解：员工名单、现有工地、价格库。

### 1. 语音控制
流程：录音 → STT → LLM tool calling → 结构化指令 → 确认卡片 → 执行。

例："帮我给小张明天安排 151 coast rd 拉线的活" →
`create_job({ assignee: "emp_x", date: "YYYY-MM-DD", site: "site_x", stage: "rough_in" })`

- "小张" → 员工表模糊匹配；"151 coast rd" → 现有工地或 NZ 地址库（NZ Post / LINZ）校验；"明天" 按 Auckland 时区。
- STT 必须测试：**中英混说**、Kiwi 口音、毛利地名、行业术语（rough-in、fit-off、GPO、downlight、CoC…）。
- 工地信号差：录音先存本地，离线队列，有网再上传处理。

### 2. 蓝图 PDF 解析
视觉 LLM（支持 PDF 输入）按 schema 抽取：地址、Lot/DP、面积、楼层、房间名称和数量，带 confidence。

- 地址/面积读图框（title block）和面积表上的文字，**不让模型从图上量面积**。
- 结果先给老板审核编辑再入库，生成 Site → Level → Room 结构。
- 二期：从电气图例数插座/灯/开关 → 自动 takeoff → 喂给报价。

### 3. 进度矩阵 + 语音收工汇报
进度按 **房间 × 施工阶段** 记录（不是自由文本）：

```
Job → Site → Level → Room
Stage: 打洞/布管 → 拉线 rough-in → 装面板 fit-off → 测试 → CoC / ESC
```

例：工人说"拉线完成了一楼加二楼主人套房，二楼其他已打好洞，还要半天" → LLM 生成矩阵 diff：
一楼全部 rough-in ✅；二楼主卧 rough-in ✅；二楼其他 打洞 ✅、rough-in ⏳、剩余预估 0.5 天 → 工人确认 → 老板实时看到。
同时支持手动打卡 / 编辑。

### 4. AI 报价（重点方向）
结构：**Takeoff（数量）→ Assembly（组合件）→ Price book（价格库）→ Quote**

- **Assembly**：如"双联插座" = 底盒 + GPO + N 米 TPS 电缆 + X 分钟人工。报价 = Σ 数量 × assembly 成本 + 利润率，代码计算。
- **AI 做 takeoff**：从电气图数点位，或从老板语音/文字描述（"两层三房，40 个 downlight，厨房 6 个插座…"）生成草稿。
- **AI 做映射**：把 takeoff 项目和供应商 SKU 映射到 assembly / 价格库（模糊匹配、同义词、不同供应商命名不一致）。
- **收据/发票识别**：拍 Bunnings / 电料批发商的收据或 PDF 发票 → AI 抽取明细 → 匹配到 job（成本核算）+ 自动更新价格库。**不需要和供应商签 API 合作就能起步。**
- **价格表导入**：供应商给的 CSV / PDF 价目表格式各异，AI 做字段映射和 SKU 归一化。
- **用历史数据校准人工**：进度矩阵积累"每类房间/每个阶段实际用时" → 报价工时越报越准（估 vs 实对比）。
- **变更单（variation）**：工人语音汇报里出现"客户要多加两个插座" → 自动起草 variation 给老板确认。

关于竞品供应商集成：Fergus 等产品对接供应商的常见做法一般是 ① 导入供应商价目表（按商户账户价格） ② 电子发票/账单推送，按 PO 号匹配到 job ③ 在线下单。具体实现未核实。我们的思路是先用 AI 识别收据/发票/价目表绕开 API 依赖，有用户量后再谈官方对接。

### 5. 老板秘书 + 催收要账（重点）

定位：app 不只是记录工具，而是主动提醒老板的"秘书"。**催收是重中之重**：小老板普遍活干完钱收不回来，又没时间、不好意思追。

#### 催收数据模型
```
Invoice      → 客户、job、开票日、到期日、金额（含 GST）、状态
Payment      → 每笔到账（支持部分付款）、日期、方式、关联 invoice
CollectionAttempt → 每次催收：时间、渠道（短信/邮件/电话/上门）、谁催的、内容、结果
PromiseToPay → 客户承诺：承诺日期、承诺金额 → 到期自动检查是否兑现
Dispute      → 争议标记：原因、状态（有争议时暂停自动催收）
```
每张发票 / 每个客户都要能一眼看到：**欠了多少、欠了多久（逾期天数）、催了几次、已收回多少、上次承诺什么时候付**。

- 账龄分段：未到期 / 1–30 / 31–60 / 61–90 / 90+ 天，老板看板显示总应收和各段金额。
- 客户信用画像：历史平均付款天数、失约次数 → 下次接活/报价时提示风险（如要求预付款）。
- **所有金额、天数、统计由代码计算**，AI 不算数。

#### 自动催收流程（可按公司配置）
```
到期前 3 天 友好提醒 → 到期日 → +7 天 提醒 → +14 天 正式催款 → +30 天 最终通知 → 升级（老板决定：电话 / 催收公司 / Disputes Tribunal）
```
- AI 按阶段起草消息（语气逐步升级，中英文），附付款方式（银行账号 + 参考号 / 在线付款链接）。
- 默认老板确认后发送；友好提醒类可由老板开启"自动发送"。
- 收到付款（Xero 同步或手动录入）→ **立即停止**该发票的催收序列；部分付款 → 更新余额继续。
- 承诺付款日到了没到账 → 提醒老板 + 起草跟进消息。
- 渠道：SMS（Twilio 或 NZ 本地短信商）、邮件；每次发送自动记录为 CollectionAttempt。

#### 语音交互
- "151 coast rd 那家今天说下周五先付一半" → 记录一次电话催收 + 创建 PromiseToPay（下周五，50%）+ 到期自动检查。
- "谁欠我钱最多？" "Smith 欠了多久了？" "这个月收回来多少？" → 查询回答（数字来自数据库查询，AI 只负责理解问题和组织回答）。
- "给所有逾期超过 30 天的客户发催款" → 生成批量草稿 → 确认 → 发送。

#### NZ 法律相关（实现前需法律核实）
- **Construction Contracts Act 2002**：payment claim / payment schedule 机制——按法定格式发出 payment claim，付款方在期限内（默认 20 个工作日）未回复 payment schedule 则全额成为可追讨债务。app 可生成合规 payment claim 并跟踪回复期限。住宅客户有额外告知要求。另有 retention money（保留金）制度，分包电工相关。
- 小额追讨：Disputes Tribunal（有金额上限）。
- 催收措辞不能构成骚扰或误导（Fair Trading Act）；电子消息遵守 Unsolicited Electronic Messages Act 2007（标明发送方）。
- 逾期利息只能按合同/条款约定收取。

#### 秘书的其他提醒
- **每日早报**（推送给老板）：今天谁在哪个工地、今日到期/逾期应收、待跟进报价、待办证书、异常（工人没打卡等）。
- **每日晚报**：汇总工人收工汇报、进度变化。
- **漏开票提醒**（很重要，隐形亏钱）：job 完工但没开票 / variation 没计费。
- 报价发出 N 天没回复 → 提醒跟进。
- 完工后 CoC / ESC 未出具 → 提醒。
- 资质与设备：电工执照（EWRB practising licence）到期、测试仪校准、车辆 WOF/rego。
- 保留金释放日期。
- 通知偏好：推送 / 短信 / 邮件、免打扰时段、即时 vs 汇总。

#### 实现要点
- 调度用任务队列：pg-boss（直接用 Postgres，少一个服务）或 BullMQ + Redis（Railway 可加）。
- 提醒 = 规则引擎（事件触发 + 定时规则），**是否提醒、何时提醒由规则决定**；AI 负责起草措辞、早报摘要、排优先级。
- 催收模块可以**先从 Xero 同步未付发票**独立上线——即使我们自己的开票功能还没做，也能立刻用，是很好的切入点。

## 其他集成（后续）
- **Xero**（NZ 会计事实标准）：发票、账单、**付款状态**同步，必须做（催收依赖它自动停止催款）。
- 供应商官方 API / 价目表 feed（Bunnings PowerPass、电料批发商）。

## MVP 范围
1. 公司 / 员工管理、角色权限
2. 上传蓝图 → AI 解析 → 审核 → 生成工地和房间
3. 语音 / 手动派工，工人端收任务 + 推送
4. 语音 / 手动收工汇报 → 更新进度矩阵
5. 老板端进度看板

第二阶段优先：**催收要账 + 老板秘书**（可先接 Xero 同步未付发票，独立于自有开票功能上线）、每日早报。

之后：AI 报价、收据识别、variation、自有开票、证书（CoC/ESC）。

## 约定
- UI 支持中文 + 英文。
- 所有 AI 调用集中在 `packages/ai`，prompt 和 schema 版本化，保留输入输出日志便于评估。
