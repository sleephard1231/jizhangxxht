import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  MessageCircle,
  RotateCcw,
  Upload,
  WalletCards,
} from "lucide-react";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { importSteps } from "../data";
import { formatDateZh } from "../domain/formatters";
import { useFinance } from "../store/FinanceStore";
import {
  buildImportResult,
  getTargetFieldLabel,
  isImportableRow,
  markDuplicateRows,
  parseWorkbookFile,
  type ParsedWorkbook,
} from "../utils/importWorkbook";

type ImportMode = "generic" | "wechat" | "alipay";

const importModeOptions: Array<{
  icon: typeof Upload;
  label: string;
  mode: ImportMode;
}> = [
  { icon: Upload, label: "CSV / XLSX", mode: "generic" },
  { icon: MessageCircle, label: "微信导入", mode: "wechat" },
  { icon: WalletCards, label: "支付宝导入", mode: "alipay" },
];

export function ImportsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    addImportedTransactions,
    categoryRules,
    importHistory,
    resetDemoData,
    transactions,
  } = useFinance();
  const [parsedWorkbook, setParsedWorkbook] = useState<ParsedWorkbook | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("generic");
  const [lastImportMessage, setLastImportMessage] = useState("");
  const selectedImportOption =
    importModeOptions.find((option) => option.mode === importMode) ??
    importModeOptions[0];

  const mappingRows =
    parsedWorkbook?.columns.map((column) => ({
      source: column.source,
      sample: column.sample,
      target: getTargetFieldLabel(column.target),
    })) ?? [];
  const previewRows = parsedWorkbook?.rows.slice(0, 50) ?? [];
  const warnings =
    parsedWorkbook?.warnings ?? ["上传账单后，这里会显示解析和校验结果。"];
  const importableCount =
    parsedWorkbook?.rows.filter((row) => isImportableRow(row))
      .length ?? 0;

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setError("请选择 .csv 或 .xlsx 文件。");
      return;
    }

    setError("");
    setLastImportMessage("");
    setIsParsing(true);

    try {
      const result = await parseWorkbookFile(file, categoryRules);
      setParsedWorkbook({
        ...result,
        rows: markDuplicateRows(result.rows, transactions),
      });
    } catch (parseError) {
      setParsedWorkbook(null);
      setError(
        parseError instanceof Error
          ? parseError.message
          : "无法解析这个工作簿。",
      );
    } finally {
      setIsParsing(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handlePickFile(mode: ImportMode) {
    setImportMode(mode);
    fileInputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void handleFile(event.dataTransfer.files[0]);
  }

  function handleConfirmImport() {
    if (!parsedWorkbook) {
      return;
    }

    const result = buildImportResult(parsedWorkbook);

    if (result.transactions.length === 0) {
      setError("没有可导入的有效交易。");
      return;
    }

    const commit = addImportedTransactions(result.transactions, result.batch);
    setLastImportMessage(
      `已导入 ${commit.batch.added} 笔交易，跳过 ${commit.batch.skipped} 行。`,
    );
    setParsedWorkbook(null);
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="导入"
        description="把每月 `.csv` 或 `.xlsx` 账单导入应用，先预览、校验、映射字段，再确认保存。"
        actions={
          <button
            className="button button-secondary"
            type="button"
            onClick={resetDemoData}
          >
            <RotateCcw size={16} />
            清空本地数据
          </button>
        }
      />

      <section className="imports-hero">
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleInputChange}
        />

        <div
          className="dropzone-card"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <p className="eyebrow">上传表格</p>
          <div className="dropzone-title">
            <FileSpreadsheet size={28} />
            <h3>
              {parsedWorkbook
                ? parsedWorkbook.fileName
                : "把每月账单拖到这里"}
            </h3>
          </div>
          <p>
            {parsedWorkbook
              ? `已从 ${parsedWorkbook.sheetName} 解析 ${parsedWorkbook.rowCount} 行，可导入 ${importableCount} 笔有效交易。`
              : "支持 `.csv` 和 `.xlsx` 文件。上传后会自动识别日期、金额、借方/贷方和商户字段。"}
          </p>
          <div className="import-mode-note">
            当前方式：{selectedImportOption.label}
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          {lastImportMessage ? (
            <p className="form-success">{lastImportMessage}</p>
          ) : null}
          <div className="dropzone-actions">
            <div className="import-source-group" aria-label="选择导入方式">
              {importModeOptions.map((option) => {
                const Icon = option.icon;

                return (
                  <button
                    key={option.mode}
                    className={`import-source-button${
                      importMode === option.mode ? " is-active" : ""
                    }`}
                    type="button"
                    onClick={() => handlePickFile(option.mode)}
                    disabled={isParsing}
                  >
                    <Icon size={17} />
                    {isParsing && importMode === option.mode ? "解析中..." : option.label}
                  </button>
                );
              })}
            </div>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setParsedWorkbook(null);
                setError("");
                setLastImportMessage("");
              }}
            >
              清空预览
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={!parsedWorkbook || importableCount === 0}
              onClick={handleConfirmImport}
            >
              确认导入
            </button>
          </div>
        </div>

        <div className="status-card">
          <p className="eyebrow">导入状态</p>
          <h3>{parsedWorkbook ? "表格已就绪" : "等待导入"}</h3>
          <ul className="status-list">
            {parsedWorkbook ? (
              <>
                <li>识别到 {parsedWorkbook.columns.length} 列</li>
                <li>生成 {parsedWorkbook.rows.length} 行预览</li>
                <li>导入方式：{selectedImportOption.label}</li>
                <li>{warnings.length} 条校验提示</li>
              </>
            ) : (
              <>
                <li>最近导入 {importHistory.length} 个表格</li>
                <li>支持 CSV/XLSX、微信账单、支付宝账单</li>
                <li>确认导入后会联动总览和交易页</li>
              </>
            )}
          </ul>
        </div>
      </section>

      <section className="step-grid">
        {importSteps.map((item, index) => (
          <article key={item.step} className="panel step-card">
            <span className="step-index">0{index + 1}</span>
            <h3>{item.step}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <section className="split-layout">
        <article className="table-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">字段映射</p>
              <h3>预览识别结果</h3>
            </div>
            <span className="pill">
              {parsedWorkbook ? "当前表格" : "等待上传"}
            </span>
          </div>

          <div className="data-table">
            <div className="table-row table-head mapping-table">
              <span>原始列名</span>
              <span>样例值</span>
              <span>目标字段</span>
            </div>
            {mappingRows.map((item) => (
              <div key={`${item.source}-${item.target}`} className="table-row mapping-table">
                <span>{item.source}</span>
                <span>{item.sample}</span>
                <span>{item.target}</span>
              </div>
            ))}
            {mappingRows.length === 0 ? (
              <div className="empty-table-state">
                上传 `.xlsx` 后会显示字段映射结果。
              </div>
            ) : null}
          </div>
        </article>

        <aside className="detail-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">校验</p>
              <h3>导入前提醒</h3>
            </div>
          </div>

          <div className="warning-stack">
            {warnings.map((warning) => {
              const isClean = warning.startsWith("没有") || warning.startsWith("未发现");

              return (
                <div key={warning} className="warning-card warning-card-inline">
                  {isClean ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
                  <p>{warning}</p>
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="dashboard-grid">
        <article className="table-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">导入预览</p>
              <h3>解析后的前几行</h3>
            </div>
            <span className="pill">{previewRows.length} 行</span>
          </div>

          <div className="data-table">
            <div className="table-row table-head preview-table">
              <span>行号</span>
              <span>日期</span>
              <span>商户</span>
              <span>解析金额</span>
              <span>类型</span>
              <span>状态</span>
            </div>
            {previewRows.map((item) => (
              <div key={item.row} className="table-row preview-table">
                <span>{item.row}</span>
                <span>{item.date}</span>
                <span>{item.merchant}</span>
                <span>{item.parsedAmount}</span>
                <span>{item.type}</span>
                <span>{item.status}</span>
              </div>
            ))}
            {previewRows.length === 0 ? (
              <div className="empty-table-state">
                上传账单后会显示解析后的交易预览。
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">最近导入</p>
              <h3>历史记录</h3>
            </div>
          </div>

          <div className="history-list">
            {importHistory.map((item) => (
              <div key={item.id} className="history-row">
                <div>
                  <strong>{item.file}</strong>
                  <span>{formatDateZh(item.importedAt)}</span>
                </div>
                <div className="history-meta">
                  <span>{item.rows} 行</span>
                  <span>新增 {item.added}</span>
                  <span>跳过 {item.skipped}</span>
                </div>
              </div>
            ))}
            {importHistory.length === 0 ? (
              <div className="empty-table-state">
                还没有导入记录。
              </div>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  );
}
