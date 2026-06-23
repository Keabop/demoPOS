import { describe, it, expect } from 'vitest';
import { fmtMXN, fmtMXN0 } from './format';

describe('format utilities', () => {
  it('should format numbers to MXN currency with decimals', () => {
    expect(fmtMXN(1234.56)).toBe('$1,234.56');
    expect(fmtMXN(100)).toBe('$100.00');
    expect(fmtMXN(0)).toBe('$0.00');
  });

  it('should format numbers to MXN currency without decimals', () => {
    expect(fmtMXN0(1234.56)).toBe('$1,235'); // rounded
    expect(fmtMXN0(100)).toBe('$100');
    expect(fmtMXN0(0)).toBe('$0');
  });
});
