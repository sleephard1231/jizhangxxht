# 第二阶段架构说明

## 当前目标

第二阶段把项目从静态 UI 骨架升级为可持续开发的前端应用架构。
重点不是增加更多页面，而是建立稳定的数据模型、集中状态和导入流程。

## 模块边界

### `src/domain`

放领域模型和展示格式化工具。

- `types.ts`: 交易、订阅续费、导入批次等核心类型
- `formatters.ts`: 金额、日期、交易类型中文展示

内部数据使用稳定枚举，例如：

- `income`
- `expense`
- `subscription`

中文只在展示层转换，避免文案变化影响计算和筛选逻辑。

### `src/store`

放应用级状态。

- `FinanceStore.tsx`: 统一管理交易、订阅续费、导入历史
- 当前使用 `localStorage` 持久化
- 后续接后端时，这一层可以替换成 API 查询和 mutation

### `src/utils`

放不属于页面的业务工具。

- `importWorkbook.ts`: `.xlsx` 解析、字段识别、预览行转换、导入结果生成的工具


### `src/pages`

页面只负责交互和展示。

- `OverviewPage`: 从 store 读取交易并计算汇总、分类图表和最近交易
- `TransactionsPage`: 从 store 读取交易并进行筛选、搜索和详情展示
- `ImportsPage`: 上传 `.xlsx`、解析预览、确认导入到 store

## 数据流

1. 用户在 `ImportsPage` 上传 `.xlsx`
2. `parseWorkbookFile` 解析表格，生成字段映射和预览行
3. 用户点击确认导入
4. `buildImportResult` 把预览行转换成标准 `Transaction`
5. `FinanceStore` 写入交易和导入批次
6. `OverviewPage` 和 `TransactionsPage` 自动显示新数据

## 当前持久化策略

数据保存在浏览器 `localStorage`:

```text
personal-finance-web-state-v1
```

这适合个人本地原型。
后续如果需要多设备同步或长期数据安全，可以把 `FinanceStore` 后面接到数据库。

## 下一阶段建议

1. 加真实编辑能力：交易分类、备注、订阅标记可以保存。
2. 加导入去重：按日期、金额、商户、来源文件计算重复交易。
3. 加账户维度：支持多个银行卡、现金账户和手动账户。
4. 加后端：优先考虑本地 SQLite / Supabase / Firebase 其中一种。
5. 加月份切换：让总览和交易页根据月份筛选真实数据。
