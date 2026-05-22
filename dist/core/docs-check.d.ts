export type DocsCheckSeverity = "ok" | "warn" | "blocker";
export interface IDocsCheckFinding {
    severity: DocsCheckSeverity;
    name: string;
    detail: string;
}
export interface IDocsCheckReport {
    ok: boolean;
    packageVersion: string;
    checks: IDocsCheckFinding[];
    warnings: string[];
    blockers: string[];
}
/**
 * 检查文档治理规则：版本同步、主文档总量、Change Log 与旧路径引用。
 *
 * 这是只读检查，不写文件、不读取 node_modules，也不依赖 OpenCode runtime。
 */
export declare function buildDocsCheckReport(projectDir: string): IDocsCheckReport;
