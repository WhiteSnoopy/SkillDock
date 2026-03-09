export type RefreshStatus = "idle" | "refreshing" | "success" | "error";

export type SourceHealth = "unknown" | "healthy" | "degraded" | "unreachable";

export interface MarketUiState {
  selectedSourceIds: string[];
  refreshStatus: RefreshStatus;
  refreshError?: string;
  sourceHealth: Record<string, SourceHealth>;
}

export const DEFAULT_MARKET_UI_STATE: MarketUiState = {
  selectedSourceIds: [],
  refreshStatus: "idle",
  sourceHealth: {}
};

export type MarketUiAction =
  | { type: "sources/select"; sourceIds: string[] }
  | { type: "refresh/start" }
  | { type: "refresh/success" }
  | { type: "refresh/error"; error: string }
  | { type: "source/health"; sourceId: string; health: SourceHealth };

export function reduceMarketUiState(
  state: MarketUiState,
  action: MarketUiAction
): MarketUiState {
  switch (action.type) {
    case "sources/select":
      return {
        ...state,
        selectedSourceIds: [...action.sourceIds]
      };
    case "refresh/start":
      return {
        ...state,
        refreshStatus: "refreshing",
        refreshError: undefined
      };
    case "refresh/success":
      return {
        ...state,
        refreshStatus: "success",
        refreshError: undefined
      };
    case "refresh/error":
      return {
        ...state,
        refreshStatus: "error",
        refreshError: action.error
      };
    case "source/health":
      return {
        ...state,
        sourceHealth: {
          ...state.sourceHealth,
          [action.sourceId]: action.health
        }
      };
    default:
      return state;
  }
}
