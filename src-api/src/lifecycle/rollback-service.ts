export interface ChannelPointers {
  stable: string;
  beta?: string;
}

export interface RollbackSnapshot {
  skillId: string;
  previousStable: string;
  newStable: string;
  promotionFrozen: boolean;
  reason: string;
  updatedAt: string;
}

export class RollbackService {
  buildRollback(params: {
    skillId: string;
    channels: ChannelPointers;
    rollbackTarget: string;
    reason: string;
    now?: string;
  }): RollbackSnapshot {
    if (params.channels.stable === params.rollbackTarget) {
      return {
        skillId: params.skillId,
        previousStable: params.channels.stable,
        newStable: params.rollbackTarget,
        promotionFrozen: false,
        reason: params.reason,
        updatedAt: params.now ?? new Date().toISOString()
      };
    }

    return {
      skillId: params.skillId,
      previousStable: params.channels.stable,
      newStable: params.rollbackTarget,
      promotionFrozen: true,
      reason: params.reason,
      updatedAt: params.now ?? new Date().toISOString()
    };
  }
}
