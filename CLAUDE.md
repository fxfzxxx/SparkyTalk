# SparkyTalk

面向新西兰电工行业（tradies）的 AI 优先 CRM / 派工 app。用户：电工小老板（admin）+ 工人（mobile）。

**核心差异化：AI**（语音控制、蓝图解析、AI 报价）。通用 CRM 功能不和 Tradify / Fergus（都是 NZ 本土，成熟）硬拼。

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

## 其他集成（后续）
- **Xero**（NZ 会计事实标准）：发票、账单同步，必须做。
- 供应商官方 API / 价目表 feed（Bunnings PowerPass、电料批发商）。

## MVP 范围
1. 公司 / 员工管理、角色权限
2. 上传蓝图 → AI 解析 → 审核 → 生成工地和房间
3. 语音 / 手动派工，工人端收任务 + 推送
4. 语音 / 手动收工汇报 → 更新进度矩阵
5. 老板端进度看板

之后：AI 报价、收据识别、variation、Xero、证书（CoC/ESC）、发票。

## 约定
- UI 支持中文 + 英文。
- 所有 AI 调用集中在 `packages/ai`，prompt 和 schema 版本化，保留输入输出日志便于评估。
