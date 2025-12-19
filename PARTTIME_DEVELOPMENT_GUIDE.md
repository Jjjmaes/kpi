# 兼职专/兼开发说明（单人全额分成方案）

## 1. 业务范围
- 在用户和项目成员维度新增“专/兼职”标记。
- 兼职销售：项目完成时按单人全额分成，公式 `commission = (totalAmount - companyReceivable) * (1 - taxRate)`，其中 `tax = (totalAmount - companyReceivable) * taxRate`。
- 兼职排版/翻译：PM 录入费用，项目完成时直接按录入金额生成记录；不计入专职 KPI。
- 项目成员列表需显示专/兼职，结算时按标记分流 KPI/分成/费用。

## 2. 数据模型调整
- `models/User.js`
  - 新增 `employmentType: { type: String, enum: ['full_time', 'part_time'], default: 'full_time' }`。
- `models/ProjectMember.js`（或项目成员子文档）
  - 冗余 `employmentType` 快照；添加成员时从 User 带入，便于历史追溯。
- KPI/记录：沿用 `KpiRecord`
  - 兼职销售：`role = 'part_time_sales'`，`kpiValue = commission`。
  - 兼职排版：`role = 'layout'`，`kpiValue = layoutFee`。
  - 兼职翻译若有费用：使用录入的翻译费生成记录，`role` 视现有枚举决定（可用 `translator` 或新增专用值）。
- 项目字段（若缺失需补充）：`totalAmount`，`companyReceivable`，`taxRate`，`layoutFee`；翻译费字段若无需新增。
- 可选扩展记录表（若现有费用/分成表不足以存明细）：
  - Commission：`projectId`, `memberId`, `amount`, `baseAmount`, `calcDetail`, `status`。
  - ServiceFee：`projectId`, `memberId`, `amount`, `type`(`translation`|`layout`), `note`, `status`。

## 3. 接口与服务
- 用户管理 API：读写 `employmentType`。
- 项目成员 API：返回成员时携带 `employmentType` 快照；新增/更新成员时写入快照。
- 结算/KPI 生成（项目完成触发）：
  - 对成员遍历：
    - 兼职销售（role=sales 或 member.role 标识销售且 `employmentType=part_time`）：
      - `base = totalAmount - companyReceivable`
      - `tax = base * taxRate`
      - `commission = base - tax`
      - 生成 KPI/分成记录：`role='part_time_sales'`, `kpiValue=commission`；不生成原销售 KPI。
    - 兼职排版（`employmentType=part_time` 且 role=layout）：
      - 使用项目录入的 `layoutFee` 生成记录：`role='layout'`, `kpiValue=layoutFee`。
    - 兼职翻译（如需要同理）：用 PM 录入的翻译费生成记录；不生成专职 KPI。
    - 专职成员：沿用原 KPI 流程。
- 报表：
  - KPI 报表默认过滤兼职销售/排版的专职 KPI；可展示已生成的兼职记录或分成/费用报表。

## 4. 前端改动
- 用户管理页：新增专/兼职选择（开关/下拉），列表展示 `employmentType`。
- 项目成员管理：
  - 列表新增“专/兼职”列。
  - 添加/编辑成员时展示用户的类型，并提示：兼职销售按分成，兼职排版/翻译按费用，不计入专职 KPI。
- 结算/完成页面：
  - 展示将生成的分成/费用明细（基数、税、结果金额）供财务确认。
- 报表/查询：
  - KPI 列表/导出过滤兼职；分成/费用列表展示兼职记录或标记。

## 5. 兼容与迁移
- 旧用户：`employmentType` 为空时默认 `full_time`。
- 旧项目成员：加载或保存时可回填快照（从 User 补），可提供一次性脚本。
- 历史 KPI 不回滚；新规则仅影响后续生成。

## 6. 开发步骤（建议顺序）
1) 模型：User 加 `employmentType`；ProjectMember 冗余字段；如需扩展记录表先建表。
2) 接口：用户管理读写字段；成员接口返回/写入快照。
3) 前端：用户管理开关 + 成员列表展示；成员选择提示。
4) 结算逻辑：在项目完成/KPI 生成服务中加入分流计算（兼职销售分成、兼职排版/翻译费用）。
5) 报表：KPI 过滤兼职；分成/费用列表/导出。
6) 迁移与校验：默认专职；可选脚本补历史成员快照；回归测试项目完成流程、报表、权限。

## 7. 测试要点
- 创建/编辑用户：专/兼职字段保存与回显。
- 添加项目成员：快照正确；列表显示专/兼职。
- 项目完成：
  - 兼职销售生成单人全额分成记录，金额=公式结果；无销售 KPI。
  - 兼职排版生成费用记录，金额=录入的排版费；无排版专职 KPI。
  - 专职成员仍按原 KPI 生成。
- 报表：KPI 过滤兼职；分成/费用展示兼职记录。
- 兼容：未设置 `employmentType` 的老数据默认专职，不阻塞流程。

## 8. 后续可选项
- 若需要登录查看：在角色管理中保留/开放 `part_time_sales`、`layout` 等系统角色；前端表单展示；权限按需配置。
- 若需多人分配分成/费用：扩展 Commission/ServiceFee 分配维度与前端分配 UI（当前按单人全额，不启用）。


