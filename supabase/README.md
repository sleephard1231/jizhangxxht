# Supabase 接入步骤

1. 在 Supabase 新建项目。
2. 打开 SQL Editor，执行 `supabase/schema.sql` 里的全部 SQL。
3. 复制 `.env.example` 为 `.env.local`。
4. 在 `.env.local` 填入项目的 `Project URL` 和 `anon public key`。
5. 重启前端服务。

当前云端同步范围：

- 交易流水：`transactions`
- 分类规则：`category_rules`
- 导入历史：`import_batches`

数据隔离依赖 Supabase Auth 的用户 ID 和 Row Level Security。每个用户只能读写自己的 `user_id = auth.uid()` 数据。
