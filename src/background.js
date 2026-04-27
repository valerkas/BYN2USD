const NBRB_USD_RATE_URLS = [
  "https://www.nbrb.by/api/exrates/rates/USD?parammode=2",
  "https://www.nbrb.by/api/exrates/rates/431?parammode=2",
  "https://www.nbrb.by/api/exrates/rates/431"
];
const RATE_STORAGE_KEY = "usdRate";
const RATE_UPDATED_AT_KEY = "usdRateUpdatedAt";
const DAILY_RATE_ALARM_NAME = "dailyUsdRateRefresh";
const MINSK_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

async function getStoredRate() {
  const data = await chrome.storage.local.get([RATE_STORAGE_KEY, RATE_UPDATED_AT_KEY]);
  return {
    rate: data[RATE_STORAGE_KEY] ?? null,
    updatedAt: data[RATE_UPDATED_AT_KEY] ?? 0
  };
}

async function saveRate(rate) {
  await chrome.storage.local.set({
    [RATE_STORAGE_KEY]: rate,
    [RATE_UPDATED_AT_KEY]: Date.now()
  });
}

async function fetchRateFromNbrb() {
  let lastStatus = "unknown";

  for (const url of NBRB_USD_RATE_URLS) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      lastStatus = String(response.status);
      continue;
    }

    const payload = await response.json();
    const rate = Number(payload?.Cur_OfficialRate);
    if (Number.isFinite(rate) && rate > 0) {
      return rate;
    }
  }

  throw new Error(`NBRB request failed: ${lastStatus}`);
}

async function getRate(forceRefresh = false) {
  const { rate } = await getStoredRate();
  if (!forceRefresh && rate) {
    return rate;
  }

  const freshRate = await fetchRateFromNbrb();
  await saveRate(freshRate);
  return freshRate;
}

function getNextMinskNoonTimestamp(nowTs = Date.now()) {
  const nowInMinskTs = nowTs + MINSK_UTC_OFFSET_MS;
  const nextNoonInMinsk = new Date(nowInMinskTs);
  nextNoonInMinsk.setUTCHours(12, 0, 0, 0);

  if (nextNoonInMinsk.getTime() <= nowInMinskTs) {
    nextNoonInMinsk.setUTCDate(nextNoonInMinsk.getUTCDate() + 1);
  }

  return nextNoonInMinsk.getTime() - MINSK_UTC_OFFSET_MS;
}

async function scheduleDailyRefreshAlarm() {
  const when = getNextMinskNoonTimestamp();
  await chrome.alarms.create(DAILY_RATE_ALARM_NAME, {
    when,
    periodInMinutes: 24 * 60
  });
}

async function initializeRateRefresh() {
  await scheduleDailyRefreshAlarm();
  const { rate } = await getStoredRate();

  if (!rate) {
    await getRate(true);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await initializeRateRefresh();
  } catch (error) {
    console.error("Failed to initialize USD rate refresh", error);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    await scheduleDailyRefreshAlarm();
  } catch (error) {
    console.error("Failed to reschedule daily USD rate refresh", error);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== DAILY_RATE_ALARM_NAME) {
    return;
  }

  getRate(true).catch((error) => {
    console.error("Failed to refresh USD rate by daily alarm", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_USD_RATE") {
    const forceRefresh = Boolean(message.forceRefresh);
    getRate(forceRefresh)
      .then((rate) => {
        sendResponse({ ok: true, rate });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true;
  }

  return false;
});
