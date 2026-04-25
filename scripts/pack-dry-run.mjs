import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cacheDir = join(tmpdir(), "opencode-pm-workflow-npm-cache");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCommand,
  ["pack", "--dry-run", "--cache", cacheDir],
  {
    stdio: "inherit",
    shell: false,
  },
);

process.exit(result.status ?? 1);
