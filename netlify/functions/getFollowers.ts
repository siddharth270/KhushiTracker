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
const LINKEDIN_MANUAL = Number(process.env.LINKEDIN_MANUAL_COUNT ?? 0) || null;

async function fetchInstagramFollowers(): Promise<number | null> {
  try {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${IG_HANDLE}`;
    const res = await fetch(url, {
      headers: {
        'x-ig-app-id': '936619743392459',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    console.log('[IG] status:', res.status);
    const text = await res.text();
    console.log('[IG] body (first 500 chars):', text.slice(0, 500));

    if (!res.ok) return null;
    const json = JSON.parse(text);
    const count = json?.data?.user?.edge_followed_by?.count ?? null;
    console.log('[IG] parsed count:', count);
    return count;
  } catch (err) {
    console.error('[IG] error:', err);
    return null;
  }
}

async function fetchXFollowers(): Promise<number | null> {
  try {
    const url = `https://cdn.syndication.twimg.com/timeline/profile?screen_name=${X_HANDLE}&dnt=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });

    console.log('[X] status:', res.status);
    const text = await res.text();
    console.log('[X] body (first 800 chars):', text.slice(0, 800));

    if (!res.ok) return null;
    const json = JSON.parse(text);

    // Walk every plausible path
    const candidates = [
      json?.headers?.user?.followers_count,
      json?.body?.user?.followers_count,
      json?.user?.followers_count,
      ...Object.values(json?.users ?? {}).map((u: any) => u?.followers_count),
    ];
    const count = candidates.find((c) => typeof c === 'number') ?? null;
    console.log('[X] parsed count:', count, 'candidates were:', candidates);
    return count;
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

  console.log('--- Cache miss, fetching all platforms ---');
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