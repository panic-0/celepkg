export type LatestRequestTracker = {
  begin: () => number;
  invalidate: () => number;
  isLatest: (requestId: number) => boolean;
};

export function createLatestRequestTracker(): LatestRequestTracker {
  let currentRequestId = 0;
  return {
    begin() {
      currentRequestId += 1;
      return currentRequestId;
    },
    invalidate() {
      currentRequestId += 1;
      return currentRequestId;
    },
    isLatest(requestId: number) {
      return requestId === currentRequestId;
    }
  };
}
