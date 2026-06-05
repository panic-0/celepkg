export type LoadingState = {
  activeCount: number;
  loading: boolean;
  message: string;
};

export const emptyLoadingState: LoadingState = {
  activeCount: 0,
  loading: false,
  message: ""
};

export function nextLoadingState(current: LoadingState, nextLoading: boolean, message?: string): LoadingState {
  if (nextLoading) {
    return {
      activeCount: current.activeCount + 1,
      loading: true,
      message: message ?? current.message
    };
  }

  const activeCount = Math.max(0, current.activeCount - 1);
  return {
    activeCount,
    loading: activeCount > 0,
    message: activeCount > 0 ? current.message : ""
  };
}
