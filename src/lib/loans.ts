// Loan amortization: given a balance, annual rate, and fixed monthly payment,
// project the payoff. Standard reducing-balance math — interest accrues
// monthly on the remaining balance, the rest of each payment is principal.

export interface LoanProjection {
  months: number               // payments until cleared
  payoffDate: string           // YYYY-MM (approx, from `fromDate`)
  totalInterest: number        // interest paid over the remaining life
  nextInterest: number         // interest portion of the next payment
  nextPrincipal: number        // principal portion of the next payment
}

const MAX_MONTHS = 1200        // 100 years — beyond this, treat as never

function addMonths(fromIso: string, months: number): string {
  const [y, m] = fromIso.slice(0, 7).split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

// Returns null when the payment never clears the loan (payment ≤ monthly
// interest) or inputs are invalid.
export function projectLoan(
  balance: number,
  annualRatePct: number,
  monthlyPayment: number,
  fromDate: string,            // YYYY-MM-DD (today)
): LoanProjection | null {
  if (!(balance > 0) || !(monthlyPayment > 0)) return null
  const r = Math.max(0, annualRatePct || 0) / 100 / 12

  const firstInterest = balance * r
  if (monthlyPayment <= firstInterest && r > 0) return null

  let bal = balance
  let months = 0
  let totalInterest = 0
  while (bal > 0.005 && months < MAX_MONTHS) {
    const interest = bal * r
    const principal = Math.min(bal, monthlyPayment - interest)
    totalInterest += interest
    bal -= principal
    months += 1
  }
  if (months >= MAX_MONTHS) return null

  return {
    months,
    payoffDate: addMonths(fromDate, months),
    totalInterest,
    nextInterest: firstInterest,
    nextPrincipal: Math.min(balance, monthlyPayment - firstInterest),
  }
}
