export interface PageSpeedAudit {
  numericValue?: number;
  score?: number | null;
  displayValue?: string;
}

export interface PageSpeedLighthouseResult {
  categories: {
    performance: { score: number };
  };
  audits: Record<string, PageSpeedAudit>;
}

export interface LoadingExperienceMetric {
  percentile: number;
  category: string;
}

export interface PageSpeedLoadingExperience {
  id?: string;
  metrics?: {
    INTERACTION_TO_NEXT_PAINT?: LoadingExperienceMetric;
    LARGEST_CONTENTFUL_PAINT_MS?: LoadingExperienceMetric;
    CUMULATIVE_LAYOUT_SHIFT_SCORE?: LoadingExperienceMetric;
    FIRST_CONTENTFUL_PAINT_MS?: LoadingExperienceMetric;
  };
  overall_category?: string;
}

export interface PageSpeedInsightsResponse {
  lighthouseResult?: PageSpeedLighthouseResult;
  loadingExperience?: PageSpeedLoadingExperience;       
  originLoadingExperience?: PageSpeedLoadingExperience;  
}