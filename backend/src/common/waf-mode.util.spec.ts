import { resolveWafMode } from './waf-mode.util';

describe('resolveWafMode', () => {
  const original = process.env.WAF_MODE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.WAF_MODE;
    } else {
      process.env.WAF_MODE = original;
    }
  });

  it('defaults to HYBRID_BLOCK when unset', () => {
    delete process.env.WAF_MODE;
    expect(resolveWafMode()).toBe('HYBRID_BLOCK');
  });

  it('accepts MONITOR', () => {
    process.env.WAF_MODE = 'MONITOR';
    expect(resolveWafMode()).toBe('MONITOR');
  });

  it('accepts RULE_BLOCK_ML_MONITOR', () => {
    process.env.WAF_MODE = 'RULE_BLOCK_ML_MONITOR';
    expect(resolveWafMode()).toBe('RULE_BLOCK_ML_MONITOR');
  });

  it('accepts HYBRID_BLOCK explicitly', () => {
    process.env.WAF_MODE = 'HYBRID_BLOCK';
    expect(resolveWafMode()).toBe('HYBRID_BLOCK');
  });

  it('falls back to the default for an unrecognized value', () => {
    process.env.WAF_MODE = 'not-a-real-mode';
    expect(resolveWafMode()).toBe('HYBRID_BLOCK');
  });
});
