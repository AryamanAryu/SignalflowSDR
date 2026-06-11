import type { SignalCollector } from "../types";

// Framework slots for sources that require a data provider we haven't wired
// yet (news/funding/press APIs, RSS, etc.). They implement the contract and
// return nothing — so the architecture is ready, but we never fabricate data.
// To make one live: implement collect() and flip `live` to true.
function placeholder(
  key: string,
  label: string
): SignalCollector {
  return {
    key,
    label,
    live: false,
    async collect() {
      return [];
    },
  };
}

export const fundingCollector = placeholder(
  "funding",
  "Funding (news / press releases)"
);
export const productLaunchCollector = placeholder(
  "product_launch",
  "Product launches (company blog)"
);
export const expansionCollector = placeholder(
  "expansion",
  "Expansion (news / announcements)"
);
export const leadershipCollector = placeholder(
  "leadership",
  "Leadership changes (news)"
);
export const partnershipCollector = placeholder(
  "partnership",
  "Partnerships (press releases)"
);
