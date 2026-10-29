export type TrendView = 'loading' | 'guest-empty' | 'chart' | 'user-empty';

export function trendView(input: {
  loading: boolean;
  signedIn: boolean;
  pointCount: number;
}): TrendView {
  if (input.loading) return 'loading';
  if (!input.signedIn) return 'guest-empty';
  if (input.pointCount >= 2) return 'chart';
  return 'user-empty';
}
