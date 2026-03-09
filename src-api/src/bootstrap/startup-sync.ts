import type { RegistrySyncService, SyncSummary } from "../services/registry-sync-service";
import type { NetworkStateProvider } from "../services/network-state";

export interface StartupSyncResult {
  mode: "online" | "offline";
  synced: boolean;
  summary?: SyncSummary;
}

export async function runStartupRegistrySync(params: {
  networkState: NetworkStateProvider;
  registrySyncService: RegistrySyncService;
}): Promise<StartupSyncResult> {
  const online = await params.networkState.isOnline();

  if (!online) {
    return {
      mode: "offline",
      synced: false
    };
  }

  const summary = await params.registrySyncService.syncAuthorityToLocalCache();
  return {
    mode: "online",
    synced: true,
    summary
  };
}
