/**
 * Bump this whenever check logic, thresholds or scoring change.
 *
 * The UI compares a re-scan with the scan it replaced, but only when both were
 * produced by the same analyzer version — otherwise a "delta" would be mixing
 * different rules (e.g. the old lab-only LCP threshold with the new field-first
 * one).
 */
export const SEO_ANALYZER_VERSION = '2.0.0';
