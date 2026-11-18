import { BPS, runBars, type BarsState } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC', LOOKBACK_BARS = 180, DIP_BPS = 120n, RECLAIM_BARS = 3;
const TP_BPS = 100n, SL_BPS = 80n, MAX_HOLD_BARS = 360, MAX_SLIPPAGE_BPS = 500;
const hBuf: bigint[] = [], cBuf: bigint[] = [];
let entryPrice: bigint | null = null, entryBar: number | null = null;

function rollingPeak(arr: readonly bigint[], n: number): bigint {
  let p = arr[Math.max(0, arr.length - n)] ?? 0n;
  for (let i = Math.max(0, arr.length - n) + 1; i < arr.length; i++) if (arr[i] > p) p = arr[i];
  return p;
}
function priorHigh(arr: readonly bigint[], n: number): bigint {
  let p = arr[Math.max(0, arr.length - 1 - n)] ?? 0n;
  for (let i = Math.max(0, arr.length - 1 - n) + 1; i < arr.length - 1; i++) if (arr[i] > p) p = arr[i];
  return p;
}

await runBars({
  onHello() { hBuf.length = 0; cBuf.length = 0; entryPrice = null; entryBar = null; },

  onBatch(state: BarsState, batch) {
    const bar = state.latest.get(SYMBOL);
    if (!bar) return [];
    const curClose = BigInt(bar.c);
    hBuf.push(BigInt(bar.h));
    cBuf.push(curClose);

    for (const f of batch.fills) {
      if (f.symbol === SYMBOL && f.side === 'buy' && f.status === 'filled') {
        entryPrice = BigInt(f.price); entryBar = batch.seq;
      }
    }

    const pos = state.positions.get(SYMBOL);
    if (pos && pos.qty > 0n) {
      if (entryPrice === null) { entryPrice = curClose; entryBar = batch.seq; }
      const hold = batch.seq - (entryBar ?? batch.seq);
      const tp = (entryPrice * (BPS + TP_BPS)) / BPS, sl = (entryPrice * (BPS - SL_BPS)) / BPS;
      if (curClose >= tp || curClose <= sl || hold >= MAX_HOLD_BARS) {
        entryPrice = null; entryBar = null;
        return [{ side: 'sell', symbol: SYMBOL, qty: pos.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    entryPrice = null; entryBar = null;
    if (hBuf.length < RECLAIM_BARS) return [];

    const isDip = curClose <= (rollingPeak(hBuf, LOOKBACK_BARS) * (BPS - DIP_BPS)) / BPS;
    const isReclaim = curClose > priorHigh(hBuf, RECLAIM_BARS);
    if (isDip && isReclaim) {
      const spend = (state.cash * 99n) / 100n;
      if (spend >= BigInt(state.hello.fees.min_notional_quote_units)) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});
