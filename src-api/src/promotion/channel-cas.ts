export interface ChannelDocument {
  revision: string;
  channels: {
    stable: string;
    beta?: string;
  };
  updatedAt: string;
}

export class CasConflictError extends Error {
  constructor(expectedRevision: string, actualRevision: string) {
    super(
      `CAS conflict: expected revision ${expectedRevision}, actual revision ${actualRevision}`
    );
    this.name = "CasConflictError";
  }
}

export function applyChannelsCasUpdate(params: {
  current: ChannelDocument;
  expectedRevision: string;
  nextChannels: ChannelDocument["channels"];
  newRevision: string;
  now?: string;
}): ChannelDocument {
  if (params.current.revision !== params.expectedRevision) {
    throw new CasConflictError(params.expectedRevision, params.current.revision);
  }

  return {
    revision: params.newRevision,
    channels: params.nextChannels,
    updatedAt: params.now ?? new Date().toISOString()
  };
}
