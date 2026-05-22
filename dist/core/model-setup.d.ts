export type ModelSetupScope = "global" | "project";
export interface IModelSetupInput {
    projectDir: string;
    model: string;
    fallbackModel?: string;
    agents?: string[];
    scope?: ModelSetupScope;
    allowUnknown?: boolean;
}
export interface IModelSetupResult {
    ok: boolean;
    scope: ModelSetupScope;
    path: string;
    agents: string[];
    model: string;
    fallbackModel?: string;
    updated: boolean;
    warnings: string[];
    blockers: string[];
}
/**
 * 初始化 pm-workflow agent 模型配置。
 *
 * 默认写入全局配置，便于初次安装后多个项目共享同一组模型；传 `scope:
 * "project"` 时只写当前项目的 `.pm-workflow/config.json`。
 */
export declare function configureWorkflowAgentModels(input: IModelSetupInput): IModelSetupResult;
