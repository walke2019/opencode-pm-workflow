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
export type OpenCodeAgentModelScope = "global" | "project";
export interface IOpenCodeAgentModelAssignment {
    agent: string;
    model: string;
}
export interface IOpenCodeAgentModelInput {
    projectDir: string;
    assignments: IOpenCodeAgentModelAssignment[];
    scope?: OpenCodeAgentModelScope;
    allowUnknown?: boolean;
}
export interface IOpenCodeAgentModelResult {
    ok: boolean;
    scope: OpenCodeAgentModelScope;
    path: string;
    assignments: IOpenCodeAgentModelAssignment[];
    updated: boolean;
    warnings: string[];
    blockers: string[];
}
/**
 * 写入 OpenCode 官方 `opencode.json.agent.<id>.model` 配置。
 *
 * 与 `configureWorkflowAgentModels` 不同，这个函数写 OpenCode 自己读取的 agent
 * 配置，而不是 pm-workflow 的内部 fallback metadata。默认 scope=global。
 */
export declare function configureOpenCodeAgentModels(input: IOpenCodeAgentModelInput): IOpenCodeAgentModelResult;
/** 构建 6 个 pm-workflow agent + explore 的同模型分配。 */
export declare function buildDefaultOpenCodeAgentModelAssignments(model: string): IOpenCodeAgentModelAssignment[];
/**
 * 初始化 pm-workflow agent 模型配置。
 *
 * 默认写入全局配置，便于初次安装后多个项目共享同一组模型；传 `scope:
 * "project"` 时只写当前项目的 `.pm-workflow/config.json`。
 */
export declare function configureWorkflowAgentModels(input: IModelSetupInput): IModelSetupResult;
