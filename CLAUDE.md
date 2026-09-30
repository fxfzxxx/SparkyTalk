# SparkyTalk

面向新西兰电工行业（tradies）的 AI 优先 CRM / 派工 app。用户：电工小老板（admin）+ 工人（mobile）。

**核心差异化：AI**（语音控制、蓝图解析、AI 报价），以及 **AI 老板秘书**（通知提醒 + 催收要账，重点）。通用 CRM 功能不和 Tradify / Fergus（都是 NZ 本土，成熟）硬拼。

> 当前状态：MVP 骨架已搭好（见下方"代码现状"）。本文件同时记录产品方向，后续逐步实现。

## 代码现状与常用命令

- `pnpm install` / `pnpm dev` / `pnpm typecheck` / `pnpm test`（turbo 跑全部包）。改完代码提交前跑 typecheck 和 test。
- 数据库：改 `apps/api/src/db/schema.ts` → `pnpm db:generate` 生成迁移（提交到 `apps/api/drizzle/`）→ `pnpm db:migrate`。`pnpm --filter @sparkytalk/api db:seed` 生成演示数据。
- 本地 Postgres：`pnpm db:start`（`scripts/dev-db.mjs`，embedded-postgres 便携版，不用装 Postgres/Docker），数据在 `.pgdata/`（gitignore）。要一直开着，另开终端跑 `pnpm dev`；删 `.pgdata/` 重新 migrate + seed 即可重置。
- Auth 尚未选型：API 仅支持 `AUTH_MODE=dev`（请求头 `x-dev-user-id` = 用户名或员工 id；演示用户 `admin` 老板、`worker1` 张伟、`worker2` Mike），生产环境禁止启用。所有查询必须按 `companyId` 隔离。
- 密钥：`ANTHROPIC_API_KEY` 只放 `apps/api/.env`（gitignore），绝不提交；部署时放 Railway 环境变量。仓库里只有留空的 `.env.example`。

### 新电脑上继续开发

需要 Node 22+ 和 git。数据库数据不随代码走，新电脑上重新 seed。

1. `git clone https://github.com/fxfzxxx/SparkyTalk.git`，切到当前开发分支。
2. `corepack enable`（管理员终端，一次性；让 `pnpm` 命令可用。不想用管理员就每条命令前加 `corepack`，但 `pnpm dev` 依赖 turbo 找到 pnpm，需要 enable）。
3. `pnpm install`
4. `cp .env.example apps/api/.env`，填 `ANTHROPIC_API_KEY`（建议每台电脑在 Anthropic Console 单独建一个 key，或从密码管理器取；不要用聊天/邮件/Git 传）。
5. 终端 A：`pnpm db:start`（保持运行）。
6. 终端 B：`pnpm db:migrate` → `pnpm --filter @sparkytalk/api db:seed` → `pnpm dev`（api :8787，admin :3000）。
7. 打开后台，右上角用户名输入 `admin` 回车。

端口冲突：admin 默认 3000，被占用时在 `apps/admin` 下跑 `pnpm exec next dev --port 3002`，并把该地址加进 `apps/api/.env` 的 `CORS_ORIGINS`。5432 被本机 Postgres 占用时，改 `DATABASE_URL` 的端口，`db:start` 会跟着用。
- 已实现：员工/工地（含楼层房间、位置来源、围栏）、派工计划、计划变更日志、到场/离场事件、房间×阶段进度、AI 提议（语音文字指令、蓝图解析）→ 确认后落库。
- AI：`packages/ai`，模型常量在 `client.ts`；用 structured outputs（zod schema 在 `packages/shared/src/schemas/ai.ts`）；prompt 带版本号，所有输入输出存 `ai_proposals` 表。
- 手机端：Expo Router，页面在 `apps/mobile/src/app/`（今天 / 说话 / 我）；地理围栏在 `src/lib/geofence.ts`，需 dev build，Expo Go 不支持。改 Expo 相关代码前先读 `apps/mobile/AGENTS.md`。
- 待做：真实登录、语音录音 + STT（目前只能输入文字）、离线队列、推送通知、确认卡片上直接修正未匹配的人/工地。

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
- 时区一律 `Pacific/Auckland`；货币 NZD，GST 15%（按公司设置，很多小老板未注册 GST，开票要支持不含 GST）。
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
Invoice      → 客户、job、开票日、到期日、金额（GST 可选）、状态、来源（app 内开票 / 手动录入 / 外部同步）
Payment      → 每笔到账（支持部分付款）、日期、方式、关联 invoice
CollectionAttempt → 每次催收：时间、渠道（微信/短信/邮件/电话/当面）、谁催的、内容、结果
PromiseToPay → 客户承诺：承诺日期、承诺金额 → 到期自动检查是否兑现
Dispute      → 争议标记：原因、状态（有争议时暂停自动催收）
```
每张发票 / 每个客户都要能一眼看到：**欠了多少、欠了多久（逾期天数）、催了几次、已收回多少、上次承诺什么时候付**。

- 账龄分段：未到期 / 1–30 / 31–60 / 61–90 / 90+ 天，老板看板显示总应收和各段金额。
- 客户信用画像：历史平均付款天数、失约次数 → 下次接活/报价时提示风险（如要求预付款）。
- **所有金额、天数、统计由代码计算**，AI 不算数。

#### 用户现实：熟人生意为主
- 很多小老板不用 Xero，没有正规会计系统，客户多是熟人、老客户、builder。
- **app 自身必须是完整闭环**：自己开简单发票（PDF）、手动/语音记录收款，不依赖任何外部系统。
- 熟人之间催款要**给面子**：默认语气温和，提醒优先推给老板本人（"该问问老王了"），而不是直接发给客户。
- 主要沟通渠道是**微信 / 电话 / 当面**：微信没有开放 API，AI 起草消息后用系统分享 / 一键复制发到微信，发完回来点一下即记录为一次催收。
- 正式升级流程（最终通知、法律途径）默认关闭，老板可对个别客户开启。

#### 收款录入（因为没有 Xero 自动同步）
- 语音："老王转了 2000" → 匹配客户和未付发票 → 确认 → 记录 Payment。
- 截图：银行到账截图 / 转账凭证 → AI 识别金额、付款人、参考号 → 匹配发票 → 确认。
- 可选：上传银行对账单 CSV，AI 批量匹配。

#### 自动催收流程（可按公司/客户配置，默认温和）
```
到期前 3 天 友好提醒 → 到期日 → +7 天 提醒 → +14 天 正式催款 → +30 天 最终通知 → 升级（老板决定：电话 / 催收公司 / Disputes Tribunal）
```
- AI 按阶段起草消息（语气逐步升级，中英文），附付款方式（银行账号 + 参考号 / 在线付款链接）。
- 默认老板确认后发送；友好提醒类可由老板开启"自动发送"。熟人客户可设为"只提醒我，不发客户"。
- 记录到付款（语音 / 截图 / 手动，或可选的 Xero 同步）→ **立即停止**该发票的催收序列；部分付款 → 更新余额继续。
- 承诺付款日到了没到账 → 提醒老板 + 起草跟进消息。
- 渠道：微信（分享/复制）、SMS（Twilio 或 NZ 本地短信商）、邮件；每次发送记录为 CollectionAttempt。

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
- 催收不依赖外部系统：app 内简单开票 + 手动/语音/截图录入欠款和收款即可完整运转。Xero 同步只是可选增强。

### 6. 计划多变：计划 vs 实际（核心痛点）

现实：老板前一天语音排好工，但现场情况多变，老板一个电话工人就改去别的工地，app 里的安排就失效了，**事后很难追踪谁实际在哪干了多久**。

设计思路：**排班分两层——"计划"和"实际"**，并让"改计划"在两端都极其省事，同时尽量自动捕捉实际情况。

#### 1) 任何一方改计划都只需一句话
- 老板："小张下午别去 151 了，去 22 Smith St 接个急活" → 更新排班 → 工人收到推送。
- 工人："老板让我先去 22 Smith St" → 更新自己的排班 → 通知老板（老板打完电话不用再回 app 操作）。
- 每次变更记录：谁改的、何时、原因。

#### 2) 工地地理围栏，自动记录到场/离场
- 每个工地设置地理围栏（地址 geocode + 半径）。工人手机进入/离开 → 自动记录实际到场/离场时间。
- 到了一个**不在今天安排里**的工地 → 推送："你在 22 Smith St，要切换到这个工地吗？" 一键确认。
- 离开原工地时如果活没干完 → 提示快速汇报："151 Coast Rd 做到哪了？"（语音一句话 → 更新进度矩阵），剩余工作自动回到待排班列表。
- **新分区/新建地址地图上还没有**（NZ 新房很常见）——工地位置不依赖地址 geocode，按以下来源依次获取：
  1. 地址能 geocode（NZ 地址库）→ 直接用。
  2. 蓝图 site plan / title block 里的 **Lot/DP 法定描述** → 查 LINZ 地块（parcel）数据 → 用地块多边形做围栏（比圆形更准）。刚分割的地块可能还没登记，查不到则下一步。
  3. 老板在地图/卫星图上**手动拖针**（可粘贴 Google Maps 位置链接或微信位置）。
  4. **第一次到场时现场设定**：工人/老板在工地点"我在这个工地" → 取当前 GPS 作为围栏中心。最实用的兜底方案。
  5. 自动学习：工人多次在同一个未知位置长时间停留 → 询问"这是哪个工地？"
- 工地名称不强依赖正式地址：可用 "Lot 23, Stage 2, XX 分区" 或别名（"老王那个新房"），语音匹配时也查别名；正式地址分配后补上，旧名保留为别名。
- Site 数据：display_name、official_address（可空）、legal_description（Lot/DP）、aliases[]、location、geofence（圆形半径或多边形）、location_source（geocode / parcel / pin / onsite / learned）。
- 实现：Expo Location + TaskManager 的 geofencing（系统级区域监控，省电；iOS 同时监控上限 20 个区域，只注册当天/近期相关工地）。
- 隐私：**只记录工地到场/离场事件，不做持续定位**；只在工作时间生效；员工明确知情同意，可在设置中查看。涉及 Privacy Act 和雇佣关系，需核实。

#### 3) 老板看板：实时看谁在哪
- 每个工人当前所在工地（最近一次到场事件）、今天计划 vs 实际，偏离高亮。
- 晚上 AI 对账：列出计划和实际不一致、缺收工汇报的地方，追问一句即可补全。

#### 4) 实际数据的价值
- 自动生成工时表（按工地/job），不用工人手填 → 工资、按工时计费、漏开票提醒都用它。
- 每个 job 实际人工时长 → 反哺 AI 报价的人工估算。

#### 老板 ↔ 工人沟通（不急，可选）
- 不做完整通话。可选：按住说话的对讲消息 / 文字消息，按 job 归档。
- 消息里如果包含安排变更，AI 识别后提示"要更新排班吗？"——同一套语音转指令管线。
- 另可做分享导入：微信文字/截图/语音分享到 app → AI 抽取 job 或安排变更（微信无开放 API，只能走分享）。

## 其他集成（后续）
- **Xero**（可选，非必须）：目标用户很多不用 Xero，作为给较规范公司的可选集成，同步发票和付款状态。
- 供应商官方 API / 价目表 feed（Bunnings PowerPass、电料批发商）。

## MVP 范围
1. 公司 / 员工管理、角色权限
2. 上传蓝图 → AI 解析 → 审核 → 生成工地和房间
3. 语音 / 手动派工，工人端收任务 + 推送；老板和工人都能一句话改计划
4. 工地地理围栏自动记录到场/离场，计划 vs 实际，自动工时
5. 语音 / 手动收工汇报 → 更新进度矩阵（离开未完工工地时提示汇报）
6. 老板端看板：谁在哪、进度、计划偏离

第二阶段优先：**简单开票 + 催收要账 + 老板秘书**（语音/截图记收款，不依赖 Xero）、每日早报。

之后：AI 报价、收据识别、variation、证书（CoC/ESC）、可选集成（Xero、供应商）。

可选/不急：老板↔工人对讲或文字消息、微信分享导入。

## 约定
- UI 支持中文 + 英文。
- 所有 AI 调用集中在 `packages/ai`，prompt 和 schema 版本化，保留输入输出日志便于评估。
