# pmw CLI 命令参考


```bash
pmw --version                                    # 当前 CLI 版本
pmw doctor                                       # 综合健康检查
pmw doctor --json                                # JSON 输出（脚本友好）

pmw agents list                                  # 列项目级 + 全局级 agent
pmw agents promote <id> [--overwrite]            # 复制项目级 agent 到全局
pmw agents doctor [--json]                       # 检查 agent frontmatter 完整性

pmw agents theme list                            # 列出 5 套内置主题
pmw agents theme preview <id> [--scope]          # 预览渲染（dry-run）
pmw agents theme apply <id> [--scope project|global] [--agents X,Y]  # 落盘

pmw models init --model <id> [--fallback <id>]   # 初始化 agent 主模型
pmw models list                                  # 列出当前模型分配

pmw docs check [--json]                          # 检查 README / 主文档治理规则
pmw verify                                       # 本地跑 typecheck + build + smoke
```

---

