import { describe, it, expect } from 'vitest';
import { isUnlimited, quotaRule, remaining } from './limits';

/**
 * The "Restam X imagens no seu limite" picker text and the usage popover both
 * derive the image quota from quotaRule(plan, 'image') + the used count. This
 * pins the math the bug was about: REMAINING = limit - used, not the used count.
 */
describe('image quota = limit - used (same source as the usage popover)', () => {
  it('Avançado: 300 cap, 7 used -> 293 remaining (the reported bug)', () => {
    const rule = quotaRule('advanced', 'image');
    expect(rule.limit).toBe(300);
    expect(remaining(rule, 7)).toBe(293); // NOT 7 (the used count)
  });

  it('clamps at 0 (never negative) when used meets/exceeds the cap', () => {
    const rule = quotaRule('basic', 'image'); // 100/month
    expect(remaining(rule, 100)).toBe(0);
    expect(remaining(rule, 130)).toBe(0);
  });

  it('basic: 100 cap, 12 used -> 88 remaining', () => {
    expect(remaining(quotaRule('basic', 'image'), 12)).toBe(88);
  });

  it('free images are blocked (limit 0) -> 0 remaining', () => {
    const rule = quotaRule('free', 'image');
    expect(rule.limit).toBe(0);
    expect(remaining(rule, 0)).toBe(0);
  });

  it('unlimited metrics report unlimited (remaining = -1 sentinel)', () => {
    const rule = quotaRule('advanced', 'tutor'); // -1
    expect(isUnlimited(rule)).toBe(true);
    expect(remaining(rule, 999)).toBe(-1);
  });
});
