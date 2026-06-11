import type { SignalCollector } from "./types";
import { headcountCollector } from "./collectors/headcount";
import { hiringCollector } from "./collectors/hiring";
import {
  fundingCollector,
  productLaunchCollector,
  expansionCollector,
  leadershipCollector,
  partnershipCollector,
} from "./collectors/placeholders";

// The ordered set of collectors the scan orchestrator runs per company.
// Add a new source by appending its collector here.
export const COLLECTORS: SignalCollector[] = [
  hiringCollector, // highest priority
  headcountCollector,
  fundingCollector,
  productLaunchCollector,
  expansionCollector,
  leadershipCollector,
  partnershipCollector,
];

export const LIVE_COLLECTORS = COLLECTORS.filter((c) => c.live);
