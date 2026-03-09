import { useCallback, useRef, useState } from "react";
import type { GuardedError } from "../types/models";

export function useGuardedAction() {
  const [error, setError] = useState<GuardedError | null>(null);
  const [loading, setLoading] = useState(false);
  const latestRunIdRef = useRef(0);
  const pendingCountRef = useRef(0);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    const runId = latestRunIdRef.current + 1;
    latestRunIdRef.current = runId;
    pendingCountRef.current += 1;
    setLoading(true);
    if (runId === latestRunIdRef.current) {
      setError(null);
    }
    try {
      const result = await action();
      if (runId === latestRunIdRef.current) {
        setError(null);
      }
      return result;
    } catch (raw) {
      if (runId === latestRunIdRef.current) {
        const err = raw as GuardedError;
        setError({
          code: err?.code ?? "UNKNOWN",
          message: err?.message ?? "Unknown error"
        });
      }
      return null;
    } finally {
      pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
      setLoading(pendingCountRef.current > 0);
    }
  }, []);

  return { run, error, loading, clearError: () => setError(null) };
}
