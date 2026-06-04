import { describe, expect, it } from 'vitest';
import { calculateLoadedPayrollCost, calculatePayrollGrossPay, roundHours, roundMoney } from '../payrollRounding';

describe('payroll rounding', () => {
  it('calculates pay from the same two-decimal hour values shown in payroll views', () => {
    expect(roundHours(7.484)).toBe(7.48);
    expect(calculatePayrollGrossPay({ regularHours: 7.484, overtimeHours: 0, hourlyRate: 18 })).toBe(134.64);
  });

  it('rounds money to cents before applying loaded payroll cost rollups', () => {
    const grossPay = calculatePayrollGrossPay({ regularHours: 7.484, overtimeHours: 0.335, hourlyRate: 18 });

    expect(grossPay).toBe(roundMoney(7.48 * 18 + 0.34 * 18 * 1.5));
    expect(calculateLoadedPayrollCost(grossPay, 1.25)).toBe(roundMoney(grossPay * 1.25));
  });
});
