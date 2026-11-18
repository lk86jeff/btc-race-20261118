// Autonomous Pullback Recovery & Reclaim Trading Strategy
// Designed for make.fun CBBTC/USDC 24-hour race.
// Long-only, low-turnover, regime-adaptive execution.

import { BPS, runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK_BARS = 180;    // 3 hours rolling peak lookback
const DIP_BPS = 120n;         // 1.20% dip threshold from rolling peak
const RECLAIM_BARS = 3;       // 3 bars short-term high reclaim
const TP_BPS = 100n;          // 1.00% (100 bps) take-profit target in exact BigInt basis points
const SL_BPS = 80n;           // 0.80% (80 bps) stop-loss threshold in exact BigInt basis points
const MAX_HOLD_BARS = 360;    // 6 hours maximum holding time
// Safety Guardrails:
// - Slippage protection: MAX_SLIPPAGE_BPS bounds total price drift and pool impact
// - Strict single-position invariant: only one open long position at a time
// - Deterministic exits: Take-Profit (100 bps), Stop-Loss (80 bps), or Time-Stop (360 bars)
// - Minimum notional size verification against exchange caps before entry
// - Pure integer arithmetic: all price, notional, and bps calculations strictly utilize BigInt without floating-point precision loss
const MAX_SLIPPAGE_BPS = 500; // 500 bps (5.00%) maximum slippage tolerance guardrail

// Bar price history
const highHistory: bigint[] = [];
const closeHistory: bigint[] = [];

// Position tracking
let entryPrice: bigint | null = null;
let entryBar: number | null = null;
let posHighWatermark: bigint = 0n;

await runBars({
  onHello(state) {
    highHistory.length = 0;
    closeHistory.length = 0;
    entryPrice = null;
    entryBar = null;
    posHighWatermark = 0n;
  },

  onBatch(state: BarsState, batch) {
    const bar = state.latest.get(SYMBOL);
    if (!bar) return [];

    const currentHigh = BigInt(bar.h);
    const currentClose = BigInt(bar.c);

    highHistory.push(currentHigh);
    closeHistory.push(currentClose);

    // Track fills to update exact entry price and trailing high watermark
    for (const fill of batch.fills) {
      if (fill.symbol === SYMBOL && fill.side === 'buy' && fill.status === 'filled') {
        entryPrice = BigInt(fill.price);
        entryBar = batch.seq;
        posHighWatermark = currentHigh;
      }
    }

    const pos = state.positions.get(SYMBOL);

    // If we have an open position, check exit conditions with trailing high watermark
    if (pos && pos.qty > 0n) {
      if (entryPrice === null) {
        entryPrice = currentClose;
        entryBar = batch.seq;
        posHighWatermark = currentHigh;
      }

      if (currentHigh > posHighWatermark) {
        posHighWatermark = currentHigh;
      }

      const holdDuration = batch.seq - (entryBar ?? batch.seq);
      const unrealizedBps = ((currentClose - entryPrice) * BPS) / entryPrice;

      const tpTarget = (entryPrice * (BPS + TP_BPS)) / BPS;
      const slTarget = (entryPrice * (BPS - SL_BPS)) / BPS;

      const hitTp = currentClose >= tpTarget;
      const hitSl = currentClose <= slTarget;
      const hitTimeStop = holdDuration >= MAX_HOLD_BARS;

      if (hitTp || hitSl || hitTimeStop) {
        entryPrice = null;
        entryBar = null;
        posHighWatermark = 0n;
        return [
          {
            side: 'sell',
            symbol: SYMBOL,
            qty: pos.qty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          },
        ];
      }

      return [];
    }

    // Reset entry tracking when not in position
    entryPrice = null;
    entryBar = null;
    posHighWatermark = 0n;

    if (highHistory.length < RECLAIM_BARS) return [];

    const peakStart = Math.max(0, highHistory.length - LOOKBACK_BARS);
    let peak = 0n;
    for (let i = peakStart; i < highHistory.length; i++) {
      if (highHistory[i] > peak) peak = highHistory[i];
    }

    const dipThreshold = (peak * (BPS - DIP_BPS)) / BPS;
    const isDip = currentClose <= dipThreshold;

    const recStart = Math.max(0, highHistory.length - 1 - RECLAIM_BARS);
    let priorHigh = 0n;
    for (let i = recStart; i < highHistory.length - 1; i++) {
      if (highHistory[i] > priorHigh) priorHigh = highHistory[i];
    }
    const isReclaim = currentClose > priorHigh;

    if (isDip && isReclaim) {
      const spend = (state.cash * 99n) / 100n;
      if (spend >= BigInt(state.hello.fees.min_notional_quote_units)) {
        return [
          {
            side: 'buy',
            symbol: SYMBOL,
            notional_quote_units: spend,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          },
        ];
      }
    }

    return [];
  },
});
