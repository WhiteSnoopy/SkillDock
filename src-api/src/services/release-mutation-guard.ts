import type { NetworkStateProvider } from "./network-state";

export class RemoteMutationBlockedError extends Error {
  constructor(message = "Remote release mutation is blocked while offline") {
    super(message);
    this.name = "RemoteMutationBlockedError";
  }
}

export class ReleaseMutationGuard {
  constructor(private readonly networkState: NetworkStateProvider) {}

  async canMutateRemoteState(): Promise<boolean> {
    return this.networkState.isOnline();
  }

  async requireRemoteMutationCapability(): Promise<void> {
    const online = await this.canMutateRemoteState();
    if (!online) {
      throw new RemoteMutationBlockedError();
    }
  }
}
