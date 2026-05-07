// Plain-English explanations of finance jargon used throughout the app.
// Hover any label that's wrapped in <MetricLabel term="..."/> to read the
// explanation. Add new terms here, then reference by key in the UI.

export interface GlossaryEntry {
  term: string
  short: string  // 1-line headline shown bold
  long: string   // 1-2 sentences of plain explanation
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  hhi: {
    term: 'HHI',
    short: 'Herfindahl-Hirschman Index',
    long: 'Sum of squared portfolio weights × 10,000. Below 1,500 = well diversified, 1,500–2,500 = moderate, above 2,500 = highly concentrated.',
  },
  effective_holdings: {
    term: 'Effective holdings',
    short: '1 / Σ(weightᵢ²)',
    long: 'The number of equally-weighted positions you\'d need to match your current concentration. A 10-stock equal-weight portfolio has 10 effective holdings; one with one massive name has roughly 1.',
  },
  sharpe: {
    term: 'Sharpe ratio',
    short: '(Return − risk-free) ÷ total volatility',
    long: 'Return per unit of total risk. Above 1.0 = good, above 2.0 = excellent. Negative means you\'re earning less than the risk-free rate after accounting for risk.',
  },
  sortino: {
    term: 'Sortino ratio',
    short: 'Sharpe but only counts downside risk',
    long: 'Like Sharpe, but volatility includes only negative-return days. Penalises losses without punishing big upside swings. Higher is better.',
  },
  calmar: {
    term: 'Calmar ratio',
    short: 'Annualised return ÷ max drawdown',
    long: 'How much return you got per unit of pain. A Calmar of 1.0 means you earned a year\'s worth of return equal to your worst peak-to-trough drop.',
  },
  alpha: {
    term: 'Alpha',
    short: 'Excess return after benchmark exposure',
    long: 'Annualised return your portfolio earned beyond what its market exposure would predict. Positive alpha = beating the benchmark for the risk taken; negative = underperforming.',
  },
  beta: {
    term: 'Beta',
    short: 'Sensitivity to benchmark moves',
    long: 'Beta of 1.0 = your portfolio moves with the benchmark. Above 1.0 = more volatile; below 1.0 = less. Negative beta = inverse relationship (rare in equity portfolios).',
  },
  var: {
    term: 'VaR (Value at Risk)',
    short: 'Worst expected daily loss in a typical day',
    long: 'VaR 95% = a loss this large or worse happens roughly 1 day in 20. It\'s a threshold, not a maximum — bad days can be much worse.',
  },
  cvar: {
    term: 'CVaR (Conditional VaR)',
    short: 'Average loss on the worst 5% of days',
    long: 'The "tail" beyond VaR. Tells you how bad it actually gets when things go wrong, not just how often. Usually larger than VaR.',
  },
  max_drawdown: {
    term: 'Max drawdown',
    short: 'Worst peak-to-trough decline',
    long: 'The largest single drop from a recent high to a subsequent low in the period. Recovery isn\'t counted — this is the worst pain at the bottom.',
  },
  tracking_error: {
    term: 'Tracking error',
    short: 'How much your returns deviate from the benchmark',
    long: 'Annualised standard deviation of the daily return gap between portfolio and benchmark. Higher = more active; near zero = basically tracking the benchmark.',
  },
  information_ratio: {
    term: 'Information ratio',
    short: 'Active return ÷ tracking error',
    long: 'How efficient your bets-vs-benchmark are. Above 0.5 is good; above 1.0 is rare. Negative means you\'re underperforming the benchmark per unit of active risk.',
  },
  look_through: {
    term: 'Look-through',
    short: 'Decompose ETFs into their underlying holdings',
    long: 'A global ETF that holds 60% US stocks is counted as 60% US, not as a single ETF. Gives a true picture of geographic, sector, and currency exposure.',
  },
  cagr: {
    term: 'CAGR',
    short: 'Compound Annual Growth Rate',
    long: 'The single annual rate that would grow your starting amount into your ending amount over the period. Smooths out year-to-year volatility into one number.',
  },
  twr: {
    term: 'Time-weighted return',
    short: 'Pure performance, ignores cashflow timing',
    long: 'Chains daily returns multiplicatively without weighting by how much money was invested when. Best metric for evaluating portfolio quality regardless of contribution timing.',
  },
  mwr: {
    term: 'Money-weighted return',
    short: 'Actual ROI on dollars deployed',
    long: 'Treats your portfolio like an internal-rate-of-return calculation: cashflows in, cashflows out, what was the rate? Sensitive to when you bought — gives the bigger number when you happen to buy before a rally.',
  },
  yield: {
    term: 'Dividend yield',
    short: 'Trailing 12m dividends ÷ current price',
    long: 'Expected annual income from dividends as a percentage of the current share price. Forward-looking estimate based on the past year\'s payments.',
  },
  yield_on_cost: {
    term: 'Yield on cost',
    short: 'Trailing dividends ÷ cost basis',
    long: 'Annual dividend per share divided by what you paid. Tells you the income return on your invested capital — climbs over time as companies raise dividends.',
  },
  wht: {
    term: 'Withholding tax',
    short: 'Foreign government\'s cut on dividends',
    long: 'For Singapore-resident investors: 30% on US-domiciled funds, ~15% on Irish UCITS (via the US-Ireland treaty), 0% on SG/UK/HK. Capital gains are not affected.',
  },
  drift: {
    term: 'Drift',
    short: 'Distance from your target weight',
    long: 'Drift = current allocation % − target allocation %. Positive drift means you\'re overweight that position; negative means underweight. Tolerance bands flag positions that have drifted too far.',
  },
  hhi_score: {
    term: 'Top-N concentration',
    short: 'Combined weight of your largest N holdings',
    long: 'Top-5 = sum of your 5 largest positions. Above 60–70% means a few names drive most of your returns — high reward, high single-name risk.',
  },
}
