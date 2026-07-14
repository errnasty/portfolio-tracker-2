// End-of-month cashflow forecast: current bank balance, minus the average
// daily discretionary burn, plus/minus scheduled money (salary, bills) on
// their due dates. All amounts in base currency.

export interface ScheduledFlow {
  date: string                 // YYYY-MM-DD, within the forecast window
  amount: number               // signed base amount (+income, −bill)
}

export interface CashflowPoint {
  date: string
  value: number
}

export interface CashflowForecast {
  series: CashflowPoint[]      // today → end of month, daily
  endOfMonth: number
  scheduledNet: number         // net scheduled flows in the window
  dailySpend: number
}

function lastDayOfMonth(dateIso: string): string {
  const [y, m] = dateIso.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

function addDays(dateIso: string, days: number): string {
  return new Date(Date.parse(dateIso) + days * 86_400_000).toISOString().slice(0, 10)
}

export function forecastCashflow(opts: {
  today: string
  startBalance: number
  dailySpend: number           // average daily outflow (positive number)
  scheduled: ScheduledFlow[]
}): CashflowForecast {
  const { today, startBalance, dailySpend, scheduled } = opts
  const end = lastDayOfMonth(today)

  const flowsByDate = new Map<string, number>()
  let scheduledNet = 0
  for (const f of scheduled) {
    if (f.date < today || f.date > end) continue
    flowsByDate.set(f.date, (flowsByDate.get(f.date) ?? 0) + f.amount)
    scheduledNet += f.amount
  }

  const series: CashflowPoint[] = [{ date: today, value: startBalance + (flowsByDate.get(today) ?? 0) }]
  let value = series[0].value
  for (let d = addDays(today, 1); d <= end; d = addDays(d, 1)) {
    value -= dailySpend
    value += flowsByDate.get(d) ?? 0
    series.push({ date: d, value: Math.round(value * 100) / 100 })
  }

  return {
    series,
    endOfMonth: series[series.length - 1].value,
    scheduledNet,
    dailySpend,
  }
}

// Average daily discretionary outflow over the trailing `days`, from signed
// base amounts (transfers should be excluded by the caller).
export function trailingDailySpend(
  txns: { date: string; amountBase: number }[],
  today: string,
  days = 30,
): number {
  const cutoff = addDays(today, -days)
  let spend = 0
  for (const t of txns) {
    if (t.date <= cutoff || t.date > today) continue
    if (t.amountBase < 0) spend += -t.amountBase
  }
  return spend / days
}
