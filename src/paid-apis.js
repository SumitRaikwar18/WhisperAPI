const LIVE_USDC_MINT =
  process.env.MAGICBLOCK_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

function getCatalog() {
  return [
    {
      id: "weather-singapore",
      provider: "Open-Meteo Weather API",
      endpoint: "/api/live/weather?city=Singapore",
      itemLabel: "Live weather forecast for Singapore",
      amount: "0.25",
      asset: "USDC",
      description: "Paid weather endpoint backed by live Open-Meteo data.",
    },
    {
      id: "price-solana",
      provider: "CoinGecko Price API",
      endpoint: "/api/live/price?asset=solana&vs=usd",
      itemLabel: "Live price quote for SOL/USD",
      amount: "0.40",
      asset: "USDC",
      description: "Paid market-data endpoint backed by live CoinGecko pricing.",
    },
  ];
}

function resolveItemByEndpoint(pathname) {
  const catalog = getCatalog();

  if (pathname === "/api/live/weather" || pathname === "/api/mock/weather") {
    return catalog[0];
  }

  if (pathname === "/api/live/price" || pathname === "/api/mock/hotel-rate") {
    return catalog[1];
  }

  return null;
}

function resolveItemForUrl(endpoint) {
  const parsed = new URL(`http://local${endpoint}`);
  return resolveItemByEndpoint(parsed.pathname, parsed.searchParams);
}

function buildPaymentRequiredForEndpoint(endpoint) {
  const item = resolveItemForUrl(endpoint);

  if (!item) {
    return null;
  }

  return buildPaymentRequired(item);
}

function buildPaymentRequired(item) {
  const amountMinor = Math.round(Number(item.amount) * 1_000_000);
  const cluster = process.env.MAGICBLOCK_CLUSTER || "devnet";

  return {
    error: "PAYMENT_REQUIRED",
    protocol: "x402-compatible receipt retry",
    x402Version: 1,
    scheme: "exact",
    network: cluster === "mainnet" ? "solana-mainnet" : "solana-devnet",
    provider: item.provider,
    endpoint: item.endpoint,
    itemLabel: item.itemLabel,
    amount: item.amount,
    asset: item.asset,
    payTo: `${item.provider.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_escrow`,
    payment: {
      amountMinor,
      amountDisplay: `${item.amount} ${item.asset}`,
      mint: LIVE_USDC_MINT,
      cluster,
      settlement: "private-transfer",
      receiptKind: "single-use",
    },
    message:
      "402 Payment Required. Retry with X-Payment or X-Payment-Receipt containing a valid receipt.",
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WhisperAPI/0.1",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream provider error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function buildWeatherResponse(searchParams) {
  const city = searchParams.get("city") || "Singapore";
  const geo = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city
    )}&count=1&language=en&format=json`
  );

  if (!geo.results || !geo.results.length) {
    throw new Error(`No live weather provider result for city "${city}".`);
  }

  const location = geo.results[0];
  const forecast = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
  );

  return {
    city: location.name,
    country: location.country,
    forecast: {
      currentTemperatureC: forecast.current?.temperature_2m ?? null,
      windSpeedKmh: forecast.current?.wind_speed_10m ?? null,
      highC: forecast.daily?.temperature_2m_max?.[0] ?? null,
      lowC: forecast.daily?.temperature_2m_min?.[0] ?? null,
    },
    providerMode: "live",
    source: "Open-Meteo Weather API",
  };
}

async function buildPriceResponse(searchParams) {
  const asset = (searchParams.get("asset") || "solana").toLowerCase();
  const vs = (searchParams.get("vs") || "usd").toLowerCase();
  const price = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      asset
    )}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true`
  );

  if (!price[asset] || price[asset][vs] === undefined) {
    throw new Error(`No live price result for ${asset}/${vs}.`);
  }

  return {
    asset,
    vs,
    price: price[asset][vs],
    change24h: price[asset][`${vs}_24h_change`] ?? null,
    providerMode: "live",
    source: "CoinGecko Price API",
  };
}

async function buildPaidApiResponse(pathname, searchParams) {
  if (pathname === "/api/live/weather" || pathname === "/api/mock/weather") {
    try {
      return await buildWeatherResponse(searchParams);
    } catch (error) {
      return {
        city: searchParams.get("city") || "Singapore",
        forecast: "Fallback forecast unavailable from live provider",
        providerMode: "fallback",
        source: "Open-Meteo Weather API",
        warning: error.message,
      };
    }
  }

  if (pathname === "/api/live/price" || pathname === "/api/mock/hotel-rate") {
    try {
      return await buildPriceResponse(searchParams);
    } catch (error) {
      return {
        asset: (searchParams.get("asset") || "solana").toLowerCase(),
        vs: (searchParams.get("vs") || "usd").toLowerCase(),
        price: null,
        providerMode: "fallback",
        source: "CoinGecko Price API",
        warning: error.message,
      };
    }
  }

  return null;
}

module.exports = {
  getCatalog,
  buildPaymentRequired,
  buildPaymentRequiredForEndpoint,
  resolveItemByEndpoint,
  resolveItemForUrl,
  buildPaidApiResponse,
};
