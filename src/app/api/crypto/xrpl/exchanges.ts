import { fetchJson, memo, readJson, writeJson } from "../lib/cache.ts";

/* Which XRP Ledger accounts belong to exchanges.

   XRPScan publishes the ledger's "well-known" names — about 2 800 labelled
   accounts, from exchanges to casinos, NFT projects and issuers. Only the
   names below are treated as exchanges: centralised venues where a deposit
   is a coin arriving to be traded. Bridges, payment apps and custodians are
   left out on purpose, because money moving through them says nothing
   about selling pressure. */

export const EXCHANGE_NAMES = new Set([
  "Binance", "Binance US", "Coinbase", "Kraken", "Bitstamp", "UPbit", "Bithumb", "Korbit", "Coinone",
  "Bybit", "OKX", "KuCoin", "HTX", "Gate.io", "Bitfinex", "Crypto.com", "Bitget", "MEXC", "BingX",
  "Bitrue", "CoinEx", "BitMart", "Poloniex", "HitBTC", "EXMO", "Bitvavo", "Bitpanda", "SwissBorg",
  "eToro", "Uphold", "Gemini", "Robinhood", "Luno", "Firi", "Bitso", "bitFlyer", "bitbank", "Coincheck",
  "SBI VC", "SBI VC Trade", "DeCurret", "GMO Coin", "BTC Markets", "Independent Reserve", "Indodax",
  "Bitkub", "PDAX", "Coins.ph", "ZebPay", "WazirX", "CoinDCX", "Bitbns", "Nobitex", "BITx", "Deribit",
  "Mercado Bitcoin", "Bitbuy",
]);

interface WellKnown {
  name: string;
  account: string;
}

const FILE = "xrpl/exchanges.json";

/** account → exchange name. Refreshed daily; the last saved copy is used if
    XRPScan is unreachable, so a restart never starts with an empty list. */
export function exchangeAccounts(): Promise<Map<string, string>> {
  return memo("xrpl:exchanges", 24 * 3600_000, async () => {
    try {
      const rows = await fetchJson<WellKnown[]>("https://api.xrpscan.com/api/v1/names/well-known", { timeoutMs: 30_000 });
      const pairs = rows.filter((r) => EXCHANGE_NAMES.has(r.name)).map((r) => [r.account, r.name] as [string, string]);
      if (pairs.length) {
        await writeJson(FILE, pairs);
        return new Map(pairs);
      }
    } catch {
      // fall through to the saved copy
    }
    const saved = await readJson<[string, string][]>(FILE);
    if (saved?.length) return new Map(saved);
    throw new Error("No exchange account list available");
  });
}
