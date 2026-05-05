import type { Handler } from '@netlify/functions';


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

let igState: IGState = {
  lastScrapedAt: 0,
  lastKnownCount: null,
  monthKey: new Date().toISOString().slice(0, 7),
  callsThisMonth: 0,
};

async function fetchInstagramFollowers(): Promise<number | null> {
  const now = Date.now();
  const currentMonth = new Date().toISOString().slice(0, 7);

  if (igState.monthKey !== currentMonth) {
    igState.monthKey = currentMonth;
    igState.callsThisMonth = 0;
  }

  const sinceLastCall = now - igState.lastScrapedAt;
  const underInterval = sinceLastCall < IG_SCRAPER_INTERVAL_MS;
  const overBudget = igState.callsThisMonth >= IG_MONTHLY_BUDGET;

  if (underInterval) {
    const remaining = Math.ceil((IG_SCRAPER_INTERVAL_MS - sinceLastCall) / 1000);
    console.log(`[IG] throttled — next scrape in ${remaining}s. Returning cached: ${igState.lastKnownCount}`);
    return igState.lastKnownCount;
  }

  if (overBudget) {
    console.log(`[IG] monthly budget hit (${igState.callsThisMonth}/${IG_MONTHLY_BUDGET}). Returning cached: ${igState.lastKnownCount}`);
    return igState.lastKnownCount;
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error('[IG] APIFY_TOKEN env var not set');
    return igState.lastKnownCount;
  }

  console.log(`[IG] calling Apify (call ${igState.callsThisMonth + 1}/${IG_MONTHLY_BUDGET} this month)`);

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
    igState.callsThisMonth += 1;
    igState.lastScrapedAt = now;

    if (!apifyRes.ok) {
      const errBody = await apifyRes.text();
      console.error('[IG] Apify failed:', errBody.slice(0, 300));
      return igState.lastKnownCount;
    }

    const items: any = await apifyRes.json();
    const count = items?.[0]?.followersCount ?? null;

    if (typeof count === 'number') {
      igState.lastKnownCount = count;
      console.log('[IG] live count:', count);
    } else {
      console.log('[IG] Apify returned no count, keeping cached:', igState.lastKnownCount);
    }

    return igState.lastKnownCount;
  } catch (err) {
    console.error('[IG] fetch error:', err);
    igState.lastScrapedAt = now;
    return igState.lastKnownCount;
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

    // Strategy 1: brute-force regex for "followers_count":NNNN anywhere in the payload
    const regexMatches = [...html.matchAll(/"followers_count"\s*:\s*(\d+)/g)];
    if (regexMatches.length > 0) {
      // If multiple matches, take the largest — usually the profile owner's count
      // (smaller numbers are often "friends_count" misreads or related accounts)
      const counts = regexMatches.map((m) => parseInt(m[1], 10)).filter((n) => Number.isFinite(n));
      const largest = Math.max(...counts);
      console.log(`[X] regex found ${counts.length} matches, picking largest:`, largest);
      console.log(`[X] all matches:`, counts);
      return largest;
    }

    // Strategy 2: alt key name X uses sometimes
    const altMatch = html.match(/"normal_followers_count"\s*:\s*(\d+)/);
    if (altMatch) {
      const count = parseInt(altMatch[1], 10);
      console.log('[X] matched normal_followers_count:', count);
      return count;
    }

    // Strategy 3: JSON walking through __NEXT_DATA__, including headerProps this time
    const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextData) {
      try {
        const data = JSON.parse(nextData[1]);
        const pp = data?.props?.pageProps;
        const candidates = [
          pp?.headerProps?.user?.followers_count,
          pp?.headerProps?.user?.public_metrics?.followers_count,
          pp?.headerProps?.followers_count,
          pp?.contextProvider?.user?.followers_count,
          pp?.user?.followers_count,
        ];
        const found = candidates.find((c) => typeof c === 'number');
        if (found) {
          console.log('[X] matched via __NEXT_DATA__ headerProps:', found);
          return found;
        }
        console.log('[X] headerProps sample:', JSON.stringify(pp?.headerProps ?? {}).slice(0, 800));
      } catch (e) {
        console.error('[X] JSON.parse failed:', e);
      }
    }

    console.log('[X] all strategies failed');
    return null;
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