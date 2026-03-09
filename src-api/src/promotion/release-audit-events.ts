export interface PromotionCheckResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  details?: string;
}

export interface ApprovalEvent {
  role: string;
  actor: string;
  state: "approved" | "changes_requested";
  at: string;
}

export interface ReleaseAuditRecordWithEvents {
  release_id: string;
  skill_id: string;
  version: string;
  gate: {
    checks: PromotionCheckResult[];
  };
  approvals?: ApprovalEvent[];
  updated_at?: string;
}

export function appendPromotionReport(
  record: ReleaseAuditRecordWithEvents,
  checks: PromotionCheckResult[],
  now = new Date().toISOString()
): ReleaseAuditRecordWithEvents {
  return {
    ...record,
    gate: {
      checks: [...record.gate.checks, ...checks]
    },
    updated_at: now
  };
}

export function appendApprovalEvent(
  record: ReleaseAuditRecordWithEvents,
  event: ApprovalEvent,
  now = new Date().toISOString()
): ReleaseAuditRecordWithEvents {
  return {
    ...record,
    approvals: [...(record.approvals ?? []), event],
    updated_at: now
  };
}
