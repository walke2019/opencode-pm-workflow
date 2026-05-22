/**
 * 0.9.0：本地 HTML 执行回执 dashboard 生成器。
 *
 * 设计目标：
 * - 把 .pm-workflow/history.jsonl 中海量 JSON 事件渲染成可读视图。
 * - 完全本地渲染、不联网、不上传；产物是单个静态 HTML 文件。
 * - 不引入前端框架；嵌内联 CSS + 极简 JS 即可，体积 < 30KB。
 *
 * 不做的事情：
 * - 不开本地 HTTP server；不开端口；不做实时刷新。
 * - 不写入项目状态；纯只读读取 history.jsonl。
 * - 不预聚合上传到任何远端。
 */
import type { WorkflowHistoryEvent } from "./types.js";
export type ReportSummary = {
    totalEvents: number;
    generatedAt: string;
    projectDir: string;
    dispatchCount: number;
    dispatchFailures: number;
    fallbackSwitches: number;
    autoContinueChains: number;
    autoContinueSteps: number;
    autoContinueAborted: number;
    routingDenied: number;
    byType: Array<{
        type: string;
        count: number;
    }>;
};
/**
 * 从 history.jsonl 计算 dashboard 摘要。仅做计数与分组，不做趋势预测或异常检测。
 */
export declare function buildHistoryReportSummary(projectDir: string): {
    summary: ReportSummary;
    events: WorkflowHistoryEvent[];
};
/**
 * 生成单文件 HTML 报告。
 *
 * - 嵌入所有事件为 `<script>` 中的 const events 数据。
 * - 嵌入内联 CSS（约 100 行），不引外链字体。
 * - 包含一段 ~100 行 vanilla JS 处理筛选 / 折叠。
 *
 * 报告体积：与 history 事件数量线性相关；事件 < 5000 时通常 < 1MB。
 */
export declare function renderHistoryReportHtml(input: {
    summary: ReportSummary;
    events: WorkflowHistoryEvent[];
    /** 当前 npm 包版本，用于显示在页脚 */
    packageVersion?: string;
}): string;
