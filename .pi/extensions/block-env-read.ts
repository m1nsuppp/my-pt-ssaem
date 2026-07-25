import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const ENV_FILE_PATTERNS = [
  ".env",
  ".env.local",
  ".env.development.local",
  ".env.test.local",
  ".env.production.local",
  ".env.development",
  ".env.test",
  ".env.production",
  ".env.staging",
];

function isEnvFilePath(resolvedPath: string): boolean {
  const basename = resolvedPath.split("/").pop() ?? "";
  return ENV_FILE_PATTERNS.some((pattern) => {
    if (basename === pattern) return true;
    // Also match prefixed patterns like .env.local.example should not match, but .env.local.encrypted should
    // Be specific: only match exact basename match or basename starting with the pattern + "."
    if (basename.startsWith(pattern + ".")) return true;
    return false;
  });
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("read", event)) {
      const resolvedPath = event.input.path;

      if (isEnvFilePath(resolvedPath)) {
        ctx.ui.notify(
          `🚫 Blocked read of ${resolvedPath} (sensitive environment file)`,
          "warning",
        );
        return {
          block: true,
          reason: `Reading '${resolvedPath}' is blocked by block-env-read extension to protect sensitive environment variables.`,
        };
      }
    }

    // Also block write and edit on .env files for extra safety
    if (isToolCallEventType("write", event)) {
      const resolvedPath = event.input.path;

      if (isEnvFilePath(resolvedPath)) {
        ctx.ui.notify(
          `🚫 Blocked write to ${resolvedPath} (sensitive environment file)`,
          "warning",
        );
        return {
          block: true,
          reason: `Writing to '${resolvedPath}' is blocked by block-env-read extension to protect sensitive environment variables.`,
        };
      }
    }

    if (isToolCallEventType("edit", event)) {
      const resolvedPath = event.input.path;

      if (isEnvFilePath(resolvedPath)) {
        ctx.ui.notify(
          `🚫 Blocked edit of ${resolvedPath} (sensitive environment file)`,
          "warning",
        );
        return {
          block: true,
          reason: `Editing '${resolvedPath}' is blocked by block-env-read extension to protect sensitive environment variables.`,
        };
      }
    }
  });
}