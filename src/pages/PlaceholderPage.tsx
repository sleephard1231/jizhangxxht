import { PageHeader } from "../components/PageHeader";

type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="page-stack">
      <PageHeader
        title={title}
        description="这个区域先保留为占位页，等总览、交易和导入流程稳定后再继续扩展。"
      />

      <section className="panel placeholder-panel">
        <p className="eyebrow">下一步</p>
        <h3>{title}工作区</h3>
        <p>应用外壳和数据架构已经搭好，后面可以在这里继续展开完整功能。</p>
      </section>
    </div>
  );
}
