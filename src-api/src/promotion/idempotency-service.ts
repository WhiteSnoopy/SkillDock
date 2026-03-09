export interface PromotionResult {
  promotionId: string;
  skillId: string;
  targetVersion: string;
  status: "applied" | "skipped";
  createdAt: string;
}

export interface PromotionIdempotencyStore {
  get(promotionId: string): Promise<PromotionResult | null>;
  save(result: PromotionResult): Promise<void>;
}

export class PromotionIdempotencyService {
  constructor(private readonly store: PromotionIdempotencyStore) {}

  async run(params: {
    promotionId: string;
    skillId: string;
    targetVersion: string;
    apply: () => Promise<void>;
    now?: string;
  }): Promise<PromotionResult> {
    const existing = await this.store.get(params.promotionId);
    if (existing) {
      return { ...existing, status: "skipped" };
    }

    await params.apply();

    const result: PromotionResult = {
      promotionId: params.promotionId,
      skillId: params.skillId,
      targetVersion: params.targetVersion,
      status: "applied",
      createdAt: params.now ?? new Date().toISOString()
    };

    await this.store.save(result);
    return result;
  }
}
