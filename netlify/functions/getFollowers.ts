import type { Handler } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

interface FollowerData {
  x: number | null;
  instagram: number | null;
  linkedin: number | null;
}
interface CacheEntry { data: FollowerData; timestamp: number }

const CACHE_TTL_MS = 120_000;
let cache: CacheEntry | null = null;

const X_HANDLE = 'khushiSharma_22';
const IG_HANDLE = 'khushitech.ai';

const LINKEDIN_MANUAL = (() => {
  const raw = process.env.LINKEDIN_MANUAL_COUNT ?? '';
  const cleaned = raw.replace(/[^0-9]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

// ---------------------------------------------------------------------------
// Instagram via Apify — with hard rate limits to protect free-tier credits.
//
// Three layers of protection:
//   1. Min 30 minutes between Apify calls (the dashboard cache stays at 2 min;
//      between scraper calls we serve the last known count).
//   2. Hard monthly cap of 1,000 Apify calls — well under Apify's $5/mo
//      free credit (which covers ~16,000 IG profile fetches at ~$0.30/1k).
//   3. State persisted to Netlify Blobs so cold starts don't reset the
//      throttle and let the dashboard hammer the scraper.
//
// Setup:
//   - Sign up at apify.com → Settings → Integrations → API tokens → copy.
//   - In Netlify: Site config → Environment variables → APIFY_TOKEN = ...
//   - npm install @netlify/blobs (already in package.json after this change)
// ---------------------------------------------------------------------------
const IG_SCRAPER_INTERVAL_MS = 30 * 60 * 1000; // 30 min between Apify calls
const IG_MONTHLY_BUDGET = 1_000;

interface IGState {
  lastScrapedAt: number;
  lastKnownCount: number | null;
  monthKey: string;       // "YYYY-MM" — for monthly counter reset
  callsThisMonth: number;
}

const DEFAULT_IG_STATE: IGState = {
  lastScrapedAt: 0,
  lastKnownCount: null,
  monthKey: new Date().toISOString().slice(0, 7),
  callsThisMonth: 0,
};

async function fetchInstagramFollowers(): Promise<number | null> {
  const store = getStore('follower-cache');
  const now = Date.now();
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Load persistent state (survives Lambda cold starts)
  let state: IGState;
  try {
    const raw = await store.get('ig-state', { type: 'json' });
    state = (raw as IGState | null) ?? { ...DEFAULT_IG_STATE, monthKey: currentMonth };
  } catch (err) {
    console.error('[IG] blob read error:', err);
    state = { ...DEFAULT_IG_STATE, monthKey: currentMonth };
  }

  // Reset monthly counter if the month rolled over
  if (state.monthKey !== currentMonth) {
    state.monthKey = currentMonth;
    state.callsThisMonth = 0;
  }

  const sinceLastCall = now - state.lastScrapedAt;
  const underInterval = sinceLastCall < IG_SCRAPER_INTERVAL_MS;
  const overBudget = state.callsThisMonth >= IG_MONTHLY_BUDGET;

  // GUARD 1: throttled — too soon since last Apify call
  if (underInterval) {
    const remaining = Math.ceil((IG_SCRAPER_INTERVAL_MS - sinceLastCall) / 1000);
    console.log(
      `[IG] throttled — next scrape in ${remaining}s. ` +
        `Returning cached: ${state.lastKnownCount}`,
    );
    return state.lastKnownCount;
  }

  // GUARD 2: monthly budget exhausted
  if (overBudget) {
    console.log(
      `[IG] monthly budget hit (${state.callsThisMonth}/${IG_MONTHLY_BUDGET}). ` +
        `Returning cached: ${state.lastKnownCount}`,
    );
    return state.lastKnownCount;
  }

  // OK to call Apify
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error('[IG] APIFY_TOKEN env var not set');
    return state.lastKnownCount;
  }

  console.log(
    `[IG] calling Apify (call ${state.callsThisMonth + 1}/${IG_MONTHLY_BUDGET} this month)`,
  );

  try {
    const apifyRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [IG_HANDLE] }),
      },
    );

    console.log('[IG] Apify status:', apifyRes.status);

    // Increment counter and timestamp BEFORE checking response — even on error
    // Apify may have charged the run. This is the safest budget-protection.
    state.callsThisMonth += 1;
    state.lastScrapedAt = now;

    if (!apifyRes.ok) {
      const errBody = await apifyRes.text();
      console.error('[IG] Apify failed:', errBody.slice(0, 300));
      await store.setJSON('ig-state', state);
      return state.lastKnownCount;
    }

    const items = await apifyRes.json();
    const count = items?.[0]?.followersCount ?? null;

    if (typeof count === 'number') {
      state.lastKnownCount = count;
      console.log('[IG] live count:', count);
    } else {
      console.log(
        '[IG] Apify returned no count, keeping cached:',
        state.lastKnownCount,
      );
    }

    await store.setJSON('ig-state', state);
    return state.lastKnownCount;
  } catch (err) {
    console.error('[IG] fetch error:', err);
    state.lastScrapedAt = now; // still throttle on error
    try {
      await store.setJSON('ig-state', state);
    } catch (writeErr) {
      console.error('[IG] blob write error:', writeErr);
    }
    return state.lastKnownCount;
  }
}

async function fetchXFollowers(): Promise<number | null> {
  try {
    const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${X_HANDLE}?showcontext=true`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    console.log('[X] status:', res.status);
    const html = await res.text();
    console.log('[X] body length:', html.length);

    if (!res.ok || !html) return null;

    // The page embeds JSON in a <script id="__NEXT_DATA__"> tag
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
    if (!match) {
      console.log('[X] __NEXT_DATA__ not found');
      return null;
    }

    const data = JSON.parse(match[1]);
    const user =
      data?.props?.pageProps?.contextProvider?.user ??
      data?.props?.pageProps?.user ??
      data?.props?.pageProps?.headerInfo?.user;

    const count = user?.followers_count ?? user?.public_metrics?.followers_count ?? null;
    console.log('[X] parsed count:', count);
    return typeof count === 'number' ? count : null;
  } catch (err) {
    console.error('[X] error:', err);
    return null;
  }
}

async function fetchLinkedInFollowers(): Promise<number | null> {
  console.log('[LI] manual env value:', process.env.LINKEDIN_MANUAL_COUNT, '→', LINKEDIN_MANUAL);
  return LINKEDIN_MANUAL;
}

export const handler: Handler = async (event) => {
  const now = Date.now();
  const bypass = event.queryStringParameters?.fresh === '1';

  if (!bypass && cache && now - cache.timestamp < CACHE_TTL_MS) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      body: JSON.stringify({ ...cache.data, cachedAt: cache.timestamp, servedFromCache: true }),
    };
  }

  console.log('--- Cache miss/bypass, fetching all platforms ---');
  const [x, instagram, linkedin] = await Promise.all([
    fetchXFollowers(),
    fetchInstagramFollowers(),
    fetchLinkedInFollowers(),
  ]);
  console.log('--- Final result ---', { x, instagram, linkedin });

  const data: FollowerData = { x, instagram, linkedin };
  cache = { data, timestamp: now };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    body: JSON.stringify({ ...data, cachedAt: now, servedFromCache: false }),
  };
};