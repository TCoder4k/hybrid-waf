import { DetectionResult, NormalizedRequest } from '../../../common/types';

// Common contract for individual signature-based detectors (SQLi, XSS, ...).
// Synchronous and in-process — see docs/architecture.md §6.
export interface RuleDetector {
  detect(request: NormalizedRequest): DetectionResult;
}
