/* Indicator math for the chart.

   The same arithmetic as the server engine, re-exported for the client so the
   RSI and MACD panes are drawn from the same definitions the scores are
   reasoned about with. Importing the engine module directly would drag the
   whole server data layer into the browser bundle, so the two pure functions
   the chart actually needs are re-exported here instead.

   Anything beyond drawing — the rules, the analogs, the score — stays on the
   server, where the candle history lives. */

export { rsi as rsiSeries, macd as macdSeries } from "../../api/fx/engine/indicators.ts";
export type { MacdSeries } from "../../api/fx/engine/indicators.ts";
