# OpenCode skill md 规范


参考：https://opencode.ai/docs/zh-cn/skills/

### 路径（**必须子目录**）

- 全局：`~/.config/opencode/skills/<name>/SKILL.md`
- 项目：`<projectDir>/.opencode/skills/<name>/SKILL.md`
- 兼容：`~/.claude/skills/<name>/SKILL.md` 与 `~/.agents/skills/<name>/SKILL.md`

**文件名必须大写 `SKILL.md`**，必须在 `<name>/` 子目录内。

### Frontmatter

```yaml
---
name: my-skill              # 必填，必须匹配目录名
description: <1-1024 字符>  # 必填
license: MIT                # 可选
compatibility: opencode     # 可选
metadata:                   # 可选
  audience: developers
  workflow: github
---
```

`name` 必须满足 `^[a-z0-9]+(-[a-z0-9]+)*$`：
- 小写字母 + 数字 + 单连字符
- 不以 `-` 开头/结尾
- 不连续 `--`

### Supporting files（rc.9 起 skill auto-install 支持）

```
my-skill/
├── SKILL.md                # 必填，主入口
├── reference.md            # 选填，详细参考（按需加载）
├── examples.md             # 选填，使用示例
└── scripts/                # 选填，可执行脚本
    └── helper.sh           # AI 通过 bash 工具调用
```

**SKILL.md 中引用其他文件**：

```markdown
详细规范见 [reference.md](reference.md)
跑诊断脚本：`bash ${CLAUDE_SKILL_DIR}/scripts/check.sh`
```

`${CLAUDE_SKILL_DIR}` 是 OpenCode/Claude Code 提供的环境变量，指向当前 skill 所在目录。

### 权限控制（在 `opencode.json`）

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "experimental-*": "ask"
    }
  }
}
```

---

