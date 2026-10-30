import type {
  Broker,
  LaunchPolicy,
} from "../../../packages/shared-schemas/index.ts";
import { createMockBroker } from "../../../packages/shared-schemas/mock-broker.ts";
const native = "__TAURI_INTERNALS__" in window;
export const isNative = native;
export const broker: Broker = native
  ? {
      async listApps() {
        const { invoke } = await import("@tauri-apps/api/core");
        return invoke("list_apps");
      },
      async requestLaunch(appId) {
        const { invoke } = await import("@tauri-apps/api/core");
        return invoke("request_launch", { appId });
      },
      async resolveLaunch(requestId, allow) {
        const { invoke } = await import("@tauri-apps/api/core");
        return invoke("resolve_launch", { requestId, allow });
      },
      async revoke() {
        const { invoke } = await import("@tauri-apps/api/core");
        return invoke("revoke");
      },
    }
  : createMockBroker();

/** The launch policy enforced by the native broker; null outside the native app. */
export async function getLaunchPolicy(): Promise<
  (LaunchPolicy & { stored: boolean }) | null
> {
  if (!native) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("get_launch_policy");
}
export async function setLaunchPolicy(policy: LaunchPolicy): Promise<void> {
  if (!native) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_launch_policy", { policy });
}
