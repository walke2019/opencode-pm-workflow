# 故障排查索引


| # | 症状关键词 | 章节 |
|---|---|---|
| T1 | "command not found: pmw" | [pmw 命令找不到](#t1-pmw-命令找不到) |
| T2 | OpenCode log 出现 `mkdir '/.pm-workflow' failed` | [plugin 加载 mkdir 失败](#t2-plugin-加载-mkdir-失败) |
| T3 | UI 切换列表显示 6 个 agent | [切换列表显示太多](#t3-切换列表显示太多) |
| T4 | Agent md 缺 temperature / tools / permission 字段 | [agent md 字段缺失](#t4-agent-md-字段缺失) |
| T5 | commander 不调用 backendcoder / 任意子代理 | [commander task 白名单缺失](#t5-commander-task-白名单缺失) |
| T6 | writer 跑不了 git log / npm run docs | [writer bash 权限错误](#t6-writer-bash-权限错误) |
| T7 | OpenCode 不识别主题 / `agent-theme-config` skill 不生效 | [skill 子目录结构错误](#t7-skill-子目录结构错误) |
| T8 | AI 看不到 pm-workflow-config skill | [新 skill 没装上](#t8-新-skill-没装上) |
| T9 | pmw doctor 报 preferred_session_id 未设置 | [preferred_session_id warning](#t9-preferred_session_id-warning) |
| T10 | plugin cache 版本与 pmw CLI 不一致 | [版本不一致](#t10-版本不一致) |
| T11 | 子代理跟 commander 同模型 | [子代理模型继承](#t11-子代理模型继承) |
| T12 | OpenCode log 大量 ERROR 但与 pm-workflow 无关 | [其他 plugin 错误干扰](#t12-其他-plugin-错误干扰) |

---


## 通用排查思路

如果上述 12 个症状都不匹配，按以下顺序：

1. **跑 check.sh** —— 看哪个层级标 ⚠ 或 ✗
2. **看 OpenCode log 末尾 50 行** —— 看启动后是否有 pm-workflow 相关 error
3. **比对 cache 版本** —— `pmw --version` vs cache 里 package.json 的 version
4. **跑 reset-agents.sh** —— 重置 agent md 到当前主题最新版（覆盖任何手改）
5. **跑 full-clean.sh --confirm** —— 极端情况，全部重来

每一步都会输出详细日志，便于追溯。

## 关联资源
