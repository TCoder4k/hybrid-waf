// ML onboarding modes (Phase P5, docs/architecture.md §23, ADR-10) — lets a
// newly-protected site's ML behavior be observed before it can affect real
// traffic. Shared here (not private to HybridDecisionEngine) so the admin
// Settings display (Phase P6) can read the same resolved value without
// duplicating the parsing/default logic.
export type WafMode = 'MONITOR' | 'RULE_BLOCK_ML_MONITOR' | 'HYBRID_BLOCK';

const VALID_MODES: readonly WafMode[] = [
  'MONITOR',
  'RULE_BLOCK_ML_MONITOR',
  'HYBRID_BLOCK',
];

// Today's existing full-enforcement behavior, unchanged unless WAF_MODE is
// explicitly set — this default must never change silently.
const DEFAULT_WAF_MODE: WafMode = 'HYBRID_BLOCK';

export function resolveWafMode(): WafMode {
  const raw = process.env.WAF_MODE;
  return (VALID_MODES as readonly string[]).includes(raw ?? '')
    ? (raw as WafMode)
    : DEFAULT_WAF_MODE;
}
