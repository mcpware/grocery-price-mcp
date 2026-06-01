/**
 * PriceSmart Foods — REST API client.
 *
 * Endpoint: https://storefrontgateway.pricesmartfoods.com/api/stores/{storeId}/search
 * Platform: mi9cloud (Save-On-Foods group)
 * Auth: None (open API, just needs Origin header)
 * Currency: CAD
 */

const GATEWAY = 'https://storefrontgateway.pricesmartfoods.com/api';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  'Origin': 'https://www.pricesmartfoods.com',
  'Referer': 'https://www.pricesmartfoods.com/',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PsProduct {
  name: string;
  sku: string;
  brand: string;
  price: number;
  pricePerUnit: string;
  size: string;
  stockStatus: string;
  onSale: boolean;
  description: string;
}

export interface PsStore {
  id: string;
  name: string;
  retailerStoreId: string;
  address: string;
  city: string;
  postalCode: string;
}

// ---------------------------------------------------------------------------
// Known stores (discovered 2026-06-01)
// ---------------------------------------------------------------------------

export const PS_STORES: Record<string, string> = {
  'Richmond Ackroyd': '2274',
  'Station Square Burnaby': '2281',
  'Lougheed Burnaby': '2280',
  'Broadway Vancouver': '2275',
  'Kings Crossing Burnaby': '2276',
};

export const DEFAULT_STORE = '2274';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function psGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`PriceSmart API ${res.status}: ${res.statusText}`);
  return await res.json() as T;
}

function mapProduct(item: any): PsProduct {
  return {
    name: item.name || '',
    sku: item.sku || item.productId || '',
    brand: item.brand || '',
    price: item.priceNumeric || item.wholePrice || 0,
    pricePerUnit: item.pricePerUnit || '',
    size: item.unitOfSize ? `${item.unitOfSize.size}${item.unitOfSize.abbreviation}` : '',
    stockStatus: item.stockStatus || 'UNKNOWN',
    onSale: !!(item.promotions?.length) || !!(item.savingsAmount),
    description: (item.description || '').slice(0, 100),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function psSearch(query: string, storeId = DEFAULT_STORE, take = 10): Promise<{ total: number; products: PsProduct[] }> {
  const encoded = encodeURIComponent(query);
  const data = await psGet<any>(`/stores/${storeId}/search?q=${encoded}&take=${take}&sort=relevance`);
  return {
    total: data.total || 0,
    products: (data.items || []).map(mapProduct),
  };
}

export async function psSearchOnSale(query: string, storeId = DEFAULT_STORE, take = 20): Promise<{ total: number; products: PsProduct[] }> {
  const encoded = encodeURIComponent(query);
  const data = await psGet<any>(`/stores/${storeId}/search?q=${encoded}&take=${take}&sort=relevance&fpromotions=True`);
  return {
    total: data.total || 0,
    products: (data.items || []).map(mapProduct),
  };
}

export async function psGetStores(): Promise<PsStore[]> {
  const data = await psGet<any>('/stores');
  return (data.items || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    retailerStoreId: s.retailerStoreId,
    address: s.addressLine1 || '',
    city: s.city || '',
    postalCode: s.postCode || '',
  }));
}

export async function psBrowseCategory(category: string, storeId = DEFAULT_STORE, take = 20): Promise<{ total: number; products: PsProduct[] }> {
  const encoded = encodeURIComponent(`Breadcrumb:grocery/${category}`);
  const data = await psGet<any>(`/stores/${storeId}/search?q=*&take=${take}&sort=relevance&f=${encoded}`);
  return {
    total: data.total || 0,
    products: (data.items || []).map(mapProduct),
  };
}
