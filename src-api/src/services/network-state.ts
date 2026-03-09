export interface NetworkStateProvider {
  isOnline(): Promise<boolean>;
}

export class StaticNetworkStateProvider implements NetworkStateProvider {
  constructor(private readonly online: boolean) {}

  async isOnline(): Promise<boolean> {
    return this.online;
  }
}
