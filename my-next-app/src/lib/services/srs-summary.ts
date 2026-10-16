import type { SrsGlobalStats } from "./srs";

export function summarizeFutureReviews(
  futureReviews: SrsGlobalStats["futureReviews"],
) {
  return futureReviews.reduce(
    (summary, day) => ({
      totalCount: summary.totalCount + day.count,
      totalMinutes: summary.totalMinutes + day.estimatedMinutes,
    }),
    { totalCount: 0, totalMinutes: 0 },
  );
}
