const MONEY_DECIMALS = 100;
const HOUR_DECIMALS = 100;

function roundTo(value: number, factor: number) {
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundHours(value: number) {
  return roundTo(value, HOUR_DECIMALS);
}

export function roundMoney(value: number) {
  return roundTo(value, MONEY_DECIMALS);
}

export function calculatePayrollGrossPay({
  regularHours,
  overtimeHours,
  hourlyRate,
}: {
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
}) {
  const roundedRegularHours = roundHours(regularHours);
  const roundedOvertimeHours = roundHours(overtimeHours);
  return roundMoney(roundedRegularHours * hourlyRate + roundedOvertimeHours * hourlyRate * 1.5);
}

export function calculateLoadedPayrollCost(grossPay: number, multiplier: number) {
  return roundMoney(roundMoney(grossPay) * multiplier);
}
