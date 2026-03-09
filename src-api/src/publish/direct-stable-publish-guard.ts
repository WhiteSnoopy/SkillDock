export class DirectStablePublishBlockedError extends Error {
  constructor() {
    super("Direct local stable publish is blocked. Use promote-stable PR workflow.");
    this.name = "DirectStablePublishBlockedError";
  }
}

export function assertNoDirectStablePublish(channel: "beta" | "stable"): void {
  if (channel === "stable") {
    throw new DirectStablePublishBlockedError();
  }
}
