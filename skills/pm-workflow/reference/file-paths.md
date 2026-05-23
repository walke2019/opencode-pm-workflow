# 文件路径与跨平台目录结构


### macOS / Linux

| 类型 | 路径 |
|---|---|
| 配置目录 | `~/.config/opencode/` |
| 数据目录（log） | `~/.local/share/opencode/` |
| 缓存目录（plugin） | `~/.cache/opencode/` |
| pmw fallback projectDir | `~/.cache/pm-workflow/global/` |

### Windows

| 类型 | 路径 |
|---|---|
| 配置目录 | `%USERPROFILE%\.config\opencode\` |
| 数据目录 | `%USERPROFILE%\.local\share\opencode\` |
| 缓存目录 | `%USERPROFILE%\.cache\opencode\` |
| pmw fallback | `%USERPROFILE%\.cache\pm-workflow\global\` |

注意：OpenCode 在 Windows 上**不用** `%APPDATA%`，统一用 `%USERPROFILE%\.config\` 等 Linux 风格。

### plugin 装在哪

```
~/.cache/opencode/packages/
└── @walke/
    └── opencode-pm-workflow@rc/
        └── node_modules/
            └── @walke/
                └── opencode-pm-workflow/
                    ├── package.json
                    ├── dist/
                    └── skills/        ← 包内的 skill 源
```

skill auto-install 把 `skills/<id>/` 同步到 `~/.config/opencode/skills/<id>/`。

---

