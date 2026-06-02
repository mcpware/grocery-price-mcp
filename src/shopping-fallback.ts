/**
 * Shopping fallback — for stores without open APIs (Walmart, Amazon, Costco).
 *
 * Layer 1: Serper Shopping API (Google Shopping data, ~90% coverage)
 * Layer 2: Firecrawl scrape (confirm individual product pages)
 *
 * Requires SERPER_API_KEY env var.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShoppingResult {
  name: string;
  price: string;
  priceNum: number;
  store: string;
  link: string;
  rating: string;
  ratingCount: string;
  source: 'google-shopping' | 'firecrawl';
}

// ---------------------------------------------------------------------------
// API key loading
// ---------------------------------------------------------------------------

function getSerperKey(): string {
  const envKey = process.env.SERPER_API_KEY;
  if (envKey) return envKey;

  try {
    const keysFile = join(process.env.HOME || '', '.config/research-engine/keys.env');
    const content = readFileSync(keysFile, 'utf-8');
    const match = content.match(/SERPER_API_KEY=(\S+)/);
    if (match) return match[1];
  } catch { /* ignore */ }

  throw new Error('SERPER_API_KEY not found. Set env var or add to ~/.config/research-engine/keys.env');
}

function getFirecrawlKey(): string | null {
  const envKey = process.env.FIRECRAWL_API_KEY;
  if (envKey) return envKey;

  try {
    return 'fc-6ac71f90b9cb45939542e3f8c31f97a9';
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Serper Shopping search
// ---------------------------------------------------------------------------

export async function serperShopping(
  query: string,
  maxResults = 10,
  location = 'Vancouver, British Columbia, Canada',
): Promise<ShoppingResult[]> {
  const key = getSerperKey();
  const res = await fetch('https://google.serper.dev/shopping', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'ca', location, num: maxResults }),
  });

  if (!res.ok) throw new Error(`Serper Shopping ${res.status}: ${res.statusText}`);
  const data = await res.json() as any;

  return (data.shopping || []).map((item: any) => ({
    name: item.title || '',
    price: item.price || '',
    priceNum: parseFloat((item.price || '').replace(/[^0-9.]/g, '')) || 0,
    store: item.source || '',
    link: item.link || '',
    rating: item.rating ? `${item.rating}` : '',
    ratingCount: item.ratingCount ? `${item.ratingCount}` : '',
    source: 'google-shopping' as const,
  }));
}

// ---------------------------------------------------------------------------
// Serper Shopping — filter by store
// ---------------------------------------------------------------------------

export async function serperShoppingByStore(
  query: string,
  stores: string[] = ['Walmart', 'Amazon', 'Costco'],
  maxResults = 10,
): Promise<{ store: string; products: ShoppingResult[] }[]> {
  const all = await serperShopping(query, maxResults * 2);

  const grouped: Record<string, ShoppingResult[]> = {};
  for (const store of stores) {
    grouped[store] = [];
  }

  for (const item of all) {
    const storeLower = item.store.toLowerCase();
    for (const store of stores) {
      if (storeLower.includes(store.toLowerCase())) {
        if (grouped[store].length < maxResults) {
          grouped[store].push(item);
        }
        break;
      }
    }
  }

  return stores.map(store => ({ store, products: grouped[store] || [] }));
}

// ---------------------------------------------------------------------------
// Firecrawl — confirm a single product page price
// ---------------------------------------------------------------------------

export async function firecrawlConfirm(url: string): Promise<{
  title: string;
  price: string;
  inStock: boolean;
} | null> {
  const key = getFirecrawlKey();
  if (!key) return null;

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    });

    if (!res.ok) return null;
    const data = await res.json() as any;
    const md = data?.data?.markdown || '';
    const title = data?.data?.metadata?.title || '';
    const priceMatch = md.match(/\$\d+\.\d{2}/);
    const inStock = /in stock|add to cart|buy now/i.test(md) && !/unavailable|out of stock/i.test(md);

    return {
      title: title.slice(0, 80),
      price: priceMatch ? priceMatch[0] : '?',
      inStock,
    };
  } catch {
    return null;
  }
}
