import type { CategoryRule, ImportBatch, Transaction } from "./domain/types";

export const initialTransactions: Transaction[] = [
];

export const initialImportHistory: ImportBatch[] = [
];

export const initialCategoryRules: CategoryRule[] = [
  {
    id: "rule-food",
    keywords: "美团, 饿了么, 饭, 餐, 咖啡, coffee, restaurant, whole foods",
    category: "餐饮",
    kind: "expense",
  },
  {
    id: "rule-transport",
    keywords: "滴滴, 高德打车, uber, taxi, metro, 地铁, 公交",
    category: "交通",
    kind: "expense",
  },
  {
    id: "rule-shopping",
    keywords: "淘宝, 京东, 拼多多, amazon, target, shopping",
    category: "购物",
    kind: "expense",
  },
  {
    id: "rule-entertainment",
    keywords: "netflix, spotify, youtube, disney, 电影, 游戏",
    category: "娱乐",
    kind: "expense",
  },
  {
    id: "rule-income",
    keywords: "工资, salary, payroll, bonus",
    category: "收入",
    kind: "income",
  },
  {
    id: "rule-transfer",
    keywords: "微信红包, 群收款, 转账",
    category: "人情往来",
    kind: "expense",
  },
];

export const importSteps = [
  {
    step: "上传文件",
    body: "拖入 `.xlsx` 账单，或从本地选择一个表格文件。",
  },
  {
    step: "映射字段",
    body: "自动识别日期、商户、金额、账户、备注和分类列。",
  },
  {
    step: "预览校验",
    body: "导入前先检查重复记录、解析提醒和收支方向。",
  },
  {
    step: "确认导入",
    body: "保存清洗后的交易，并复用这次字段映射。",
  },
];
