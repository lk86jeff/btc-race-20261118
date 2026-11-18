import { BPS, runBars, type BarsState } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK_BARS = 180;
const DIP_BPS = 120n;
const RECLAIM_BARS = 3;
const TP_BPS = 100n, SL_BPS = 80n;
const MAX_HOLD_BARS = 360, MAX_SLIPPAGE_BPS = 500;

const highHistory: bigint[] = [], closeHistory: bigint[] = [];
let entryPrice: bigint | null = null, entryBar: number | null = null;

function getRollingPeak(highs: readonly bigint[], lookback: number): bigint {
  if (highs.length === 0) return 0n;
  const start = Math.max(0, highs.length - lookback);
  let peak = highs[start];
  for (let i = start + 1; i < highs.length; i++) if (highs[i] > peak) peak = highs[i];
  return peak;
}

function getPriorHigh(highs: readonly bigint[], lookback: number): bigint {
  if (highs.length <= 1) return 0n;
  const start = Math.max(0, highs.length - 1 - lookback);
  let prior = highs[start];
  for (let i = start + 1; i < highs.length - 1; i++) if (highs[i] > prior) prior = highs[i];
  return prior;
}

function getOrderNotional(availCash: bigint, minNotional: bigint): bigint {
  const targetSpend = (availCash * 99n) / 100n;
  return targetSpend >= minNotional ? targetSpend : 0n;
}

await runBars({
  onHello() {
    highHistory.length = 0;
    closeHistory.length = 0;
    entryPrice = null;
    entryBar = null;
  },

  onBatch(state: BarsState, batch) {
    const bar = state.latest.get(SYMBOL);
    if (!bar) return [];

    highHistory.push(BigInt(bar.h));
    closeHistory.push(BigInt(bar.c));
    const currentClose = BigInt(bar.c);

    for (const fill of batch.fills) {
      if (fill.symbol === SYMBOL && fill.side === 'buy' && fill.status === 'filled') {
        entryPrice = BigInt(fill.price);
        entryBar = batch.seq;
      }
    }

    const pos = state.positions.get(SYMBOL);
    if (pos && pos.qty > 0n) {
      if (entryPrice === null) {
        entryPrice = currentClose;
        entryBar = batch.seq;
      }
      const holdDuration = batch.seq - (entryBar ?? batch.seq);
      const tpTarget = (entryPrice * (BPS + TP_BPS)) / BPS;
      const slTarget = (entryPrice * (BPS - SL_BPS)) / BPS;

      if (currentClose >= tpTarget || currentClose <= slTarget || holdDuration >= MAX_HOLD_BARS) {
        entryPrice = null;
        entryBar = null;
        return [{ side: 'sell', symbol: SYMBOL, qty: pos.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    entryPrice = null;
    entryBar = null;
    if (highHistory.length < RECLAIM_BARS) return [];

    const peak = getRollingPeak(highHistory, LOOKBACK_BARS);
    const isDip = currentClose <= (peak * (BPS - DIP_BPS)) / BPS;
    const isReclaim = currentClose > getPriorHigh(highHistory, RECLAIM_BARS);

    if (isDip && isReclaim) {
      const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
      const spend = getOrderNotional(state.cash, minNotional);
      if (spend > 0n) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }

    return [];
  },
});
