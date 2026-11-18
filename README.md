# CBBTC 24-Hour Autonomous Pullback Recovery Trading Bot

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/lk86jeff/btc-race-20261118/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/lk86jeff/btc-race-20261118/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Autonomous high-precision trading bot for cbBTC/USDC on Solana DEX (Orca Whirlpool).
Designed for the [make.fun 24-hour BTC trading race](https://make.fun/bounty/btc-race-24h-20261118-1444).

## Strategy Overview
- **Long-Only Dip Pullback**: Identifies acute pullbacks (>= 140 bps) from 3-hour rolling high.
- **Reclaim Confirmation**: Enters only after price breaks above the 3-minute prior high to filter false dips.
- **Low Turnover**: Executes 2-4 trades per 24 hours, keeping fee drag below 1 USDC.
- **Execution Guardrails**: 50 bps max slippage protection and exact integer arithmetic.
