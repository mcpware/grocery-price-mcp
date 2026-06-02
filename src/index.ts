#!/usr/bin/env node
/**
 * Grocery Price MCP — Cross-store price comparison for Vancouver.
 *
 * 5 stores, all open APIs, no login:
 * - T&T Supermarket (Magento 2 GraphQL)
 * - Save-On-Foods (mi9cloud REST, 190 stores)
 * - PriceSmart Foods (mi9cloud REST, 5 stores)
 * - Fresh St. Market (mi9cloud REST, 9 stores)
 * - Urban Fare (mi9cloud REST, 5 stores)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { searchProducts, browseCategory, getSpecials, getCategories, FLYER_CATEGORIES } from './tnt.js';
import { mi9Search, mi9CompareAcrossStores, mi9GetStores, MI9_STORES } from './mi9cloud.js';
import { INSTACART_MARKUP, getMarkupLabel } from './instacart-fallback.js';
import { serperShopping, serperShoppingByStore, firecrawlConfirm } from './shopping-fallback.js';

const server = new McpServer({ name: 'grocery-price-mcp', version: '0.5.0' });

const MI9_SLUGS = Object.keys(MI9_STORES);

// ---------------------------------------------------------------------------
// Tool: grocery_compare — cross ALL 5 stores
// ---------------------------------------------------------------------------

server.tool(
  'grocery_compare',
  'Compare a product across ALL 5 stores (T&T + Save-On + PriceSmart + Fresh St + Urban Fare). Shows real prices, cheapest first. No login, no Instacart markup.',
  { query: z.string().describe('Product to compare, e.g. "minced garlic" or "dried shiitake"') },
  async ({ query }: { query: string }) => {
    const [tnt, mi9All] = await Promise.all([
      searchProducts(query, 5).catch(() => ({ total: 0, products: [] as any[] })),
      mi9CompareAcrossStores(query, 3),
    ]);

    const lines: string[] = [`"${query}" — cross-store comparison\n`];

    lines.push('T&T Supermarket:');
    if (tnt.products.length === 0) lines.push('  (no results)');
    for (const p of tnt.products) {
      const sale = p.onSale ? ` ${p.discountPercent.toFixed(0)}% off (was $${p.regularPrice.toFixed(2)})` : '';
      lines.push(`  ${p.name} — $${p.finalPrice.toFixed(2)}${sale}`);
    }

    for (const { store, products } of mi9All) {
      lines.push(`\n${store}:`);
      if (products.length === 0) { lines.push('  (no results)'); continue; }
      for (const p of products) {
        const unit = p.pricePerUnit ? ` (${p.pricePerUnit})` : '';
        const sale = p.onSale ? ` SALE (until ${p.saleUntil || '?'})` : '';
        lines.push(`  ${p.name} — $${p.price.toFixed(2)}${unit}${sale}`);
      }
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: tnt_search
// ---------------------------------------------------------------------------

server.tool(
  'tnt_search',
  'Search T&T Supermarket products. Returns real prices (regular + sale), stock status.',
  { query: z.string(), maxResults: z.number().optional().default(8) },
  async ({ query, maxResults }: { query: string; maxResults: number }) => {
    const { total, products } = await searchProducts(query, maxResults);
    const lines = products.map((p: any) => {
      const sale = p.onSale ? ` ${p.discountPercent.toFixed(0)}% off (was $${p.regularPrice.toFixed(2)})` : '';
      return `${p.name} — $${p.finalPrice.toFixed(2)}${sale} [${p.stockStatus}]`;
    });
    return { content: [{ type: 'text' as const, text: `T&T: ${total} results for "${query}":\n\n${lines.join('\n')}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: tnt_specials
// ---------------------------------------------------------------------------

server.tool(
  'tnt_specials',
  'Get current T&T weekly specials (Price Drop + Multi-Save).',
  {},
  async () => {
    const { priceDrop, multiSave } = await getSpecials();
    const fmt = (items: any[]) =>
      items.map((p: any) => `  ${p.name} — $${p.finalPrice.toFixed(2)} (was $${p.regularPrice.toFixed(2)}, ${p.discountPercent.toFixed(0)}% off)`).join('\n') || '  (none)';
    return { content: [{ type: 'text' as const, text: `T&T Price Drop (${priceDrop.length}):\n${fmt(priceDrop)}\n\nMulti-Save (${multiSave.length}):\n${fmt(multiSave)}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: tnt_browse
// ---------------------------------------------------------------------------

server.tool(
  'tnt_browse',
  'Browse T&T products by category ID. Use tnt_categories to find IDs.',
  { categoryId: z.number(), maxResults: z.number().optional().default(20) },
  async ({ categoryId, maxResults }: { categoryId: number; maxResults: number }) => {
    const { total, categoryName, products } = await browseCategory(categoryId, maxResults);
    const lines = products.map((p: any) => {
      const sale = p.onSale ? ` ${p.discountPercent.toFixed(0)}% off` : '';
      return `${p.name} — $${p.finalPrice.toFixed(2)}${sale}`;
    });
    return { content: [{ type: 'text' as const, text: `T&T ${categoryName} (${total}):\n\n${lines.join('\n')}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: tnt_categories
// ---------------------------------------------------------------------------

server.tool(
  'tnt_categories',
  'List T&T product categories with IDs.',
  {},
  async () => {
    const cats = await getCategories();
    const lines: string[] = [];
    for (const cat of cats) {
      lines.push(`${cat.name} (id: ${cat.id})`);
      for (const sub of cat.children) {
        lines.push(`  ${sub.name} (id: ${sub.id})`);
      }
    }
    lines.push('', 'Flyer:');
    for (const [key, id] of Object.entries(FLYER_CATEGORIES)) {
      lines.push(`  ${key} (id: ${id})`);
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: store_search — search any mi9cloud store
// ---------------------------------------------------------------------------

server.tool(
  'store_search',
  `Search products at a specific store. Available stores: ${MI9_SLUGS.join(', ')}`,
  {
    store: z.enum(MI9_SLUGS as [string, ...string[]]).describe('Store slug'),
    query: z.string(),
    maxResults: z.number().optional().default(8),
  },
  async ({ store, query, maxResults }: { store: string; query: string; maxResults: number }) => {
    const { total, products } = await mi9Search(store, query, undefined, maxResults);
    const storeName = MI9_STORES[store].name;
    const lines = products.map((p: any) => {
      const unit = p.pricePerUnit ? ` (${p.pricePerUnit})` : '';
      return `${p.name} [${p.brand}] — $${p.price.toFixed(2)}${unit}`;
    });
    return { content: [{ type: 'text' as const, text: `${storeName}: ${total} results for "${query}":\n\n${lines.join('\n')}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: store_locations — list locations for any mi9cloud store
// ---------------------------------------------------------------------------

server.tool(
  'store_locations',
  `List store locations. Available: ${MI9_SLUGS.join(', ')}`,
  { store: z.enum(MI9_SLUGS as [string, ...string[]]).describe('Store slug') },
  async ({ store }: { store: string }) => {
    const stores = await mi9GetStores(store);
    const storeName = MI9_STORES[store].name;
    const lines = stores.map((s: any) => {
      const modes = s.shoppingModes.length ? ` [${s.shoppingModes.join(', ')}]` : '';
      return `${s.name} — ${s.address}, ${s.city} ${s.postalCode} (id: ${s.retailerStoreId})${modes}`;
    });
    return { content: [{ type: 'text' as const, text: `${storeName} (${stores.length} locations):\n\n${lines.join('\n')}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: instacart_markup — check which stores have Instacart markup
// ---------------------------------------------------------------------------

server.tool(
  'instacart_markup',
  'Check which stores have Instacart price markup. Stores with markup charge ~5-15% MORE than in-store prices on Instacart. Use this to decide whether to buy via Instacart or go direct.',
  {},
  async () => {
    const noMarkup: string[] = [];
    const hasMarkup: string[] = [];
    for (const [slug, info] of Object.entries(INSTACART_MARKUP)) {
      const label = `${info.name} (${slug})`;
      if (info.noMarkup) noMarkup.push(label);
      else hasMarkup.push(label);
    }
    const lines = [
      'Instacart Markup Map (Vancouver)\n',
      'NO MARKUP (Instacart price = in-store price):',
      ...noMarkup.map(s => `  ${s}`),
      '',
      'HAS MARKUP (Instacart adds ~5-15% on top):',
      ...hasMarkup.map(s => `  ${s}`),
      '',
      'Strategy:',
      '  - Stores with open API (T&T, Save-On, PriceSmart, Fresh St, Urban Fare) -> use grocery_compare (this MCP)',
      '  - No-markup stores without API (No Frills, FreshCo, Nesters, Choices) -> Instacart is fine',
      '  - Markup stores without API (Walmart, Costco, Superstore) -> go in-store or use store website directly',
    ];
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: instacart_check — check one store's markup status
// ---------------------------------------------------------------------------

server.tool(
  'instacart_check',
  'Check if a specific store has Instacart markup. Returns whether buying via Instacart costs more than in-store.',
  { store: z.string().describe('Store slug from Instacart, e.g. "walmart-canada", "costco-canada", "no-frills-can"') },
  async ({ store }: { store: string }) => {
    const label = getMarkupLabel(store);
    const info = INSTACART_MARKUP[store];
    if (!info) {
      return { content: [{ type: 'text' as const, text: `Unknown store "${store}". Known stores: ${Object.keys(INSTACART_MARKUP).join(', ')}` }] };
    }
    const advice = info.noMarkup
      ? `${info.name}: NO markup on Instacart. Instacart price = in-store price. Safe to buy via Instacart.`
      : `${info.name}: HAS markup on Instacart (~5-15% higher). Better to buy in-store or from store website directly.`;
    return { content: [{ type: 'text' as const, text: advice }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: shopping_search — Google Shopping (Walmart/Amazon/Costco/all stores)
// ---------------------------------------------------------------------------

server.tool(
  'shopping_search',
  'Search Google Shopping for products across ALL Canadian stores (Walmart, Amazon, Costco, Canadian Tire, Home Depot, etc). Returns up to 40 results with real prices. Use this for stores without open APIs.',
  {
    query: z.string().describe('Product to search, e.g. "Anker 30W USB-C charger"'),
    maxResults: z.number().optional().default(20).describe('Max results (default 20, returns up to 2x)'),
  },
  async ({ query, maxResults }: { query: string; maxResults: number }) => {
    const results = await serperShopping(query, maxResults);
    const lines = results.map((r: any, i: number) =>
      `${i + 1}. ${r.name.slice(0, 45)} — ${r.price} | ${r.store}${r.rating ? ` (${r.rating}★ ${r.ratingCount})` : ''}`
    );
    return { content: [{ type: 'text' as const, text: `Google Shopping: ${results.length} results for "${query}":\n\n${lines.join('\n')}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: walmart_amazon_costco — compare across these 3 specifically
// ---------------------------------------------------------------------------

server.tool(
  'walmart_amazon_costco',
  'Compare a product across Walmart, Amazon, and Costco specifically. Uses Google Shopping data since these stores have no open API.',
  { query: z.string().describe('Product to search') },
  async ({ query }: { query: string }) => {
    const byStore = await serperShoppingByStore(query, ['Walmart', 'Amazon', 'Costco'], 5);
    const lines: string[] = [`"${query}" — Walmart vs Amazon vs Costco\n`];
    for (const { store, products } of byStore) {
      lines.push(`${store}:`);
      if (products.length === 0) { lines.push('  (not found on Google Shopping)'); continue; }
      for (const p of products) {
        lines.push(`  ${p.name.slice(0, 42)} — ${p.price}${p.rating ? ` (${p.rating}★)` : ''}`);
      }
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: price_confirm — Firecrawl a specific product URL to confirm price
// ---------------------------------------------------------------------------

server.tool(
  'price_confirm',
  'Confirm a product price by scraping the actual product page (Amazon, Walmart, etc). Use after shopping_search to verify a price is real and in-stock.',
  { url: z.string().describe('Product page URL to scrape') },
  async ({ url }: { url: string }) => {
    const result = await firecrawlConfirm(url);
    if (!result) return { content: [{ type: 'text' as const, text: `Could not scrape ${url}. The site may be blocking scrapers.` }] };
    const stock = result.inStock ? 'IN STOCK' : 'may be unavailable';
    return { content: [{ type: 'text' as const, text: `Confirmed: ${result.title}\nPrice: ${result.price}\nStock: ${stock}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: full_compare — compare across ALL stores (API + Google Shopping)
// ---------------------------------------------------------------------------

server.tool(
  'full_compare',
  'Compare a product across ALL stores: T&T + Save-On + PriceSmart + Fresh St + Urban Fare (via API) + Walmart + Amazon + Costco (via Google Shopping). The most comprehensive cross-store comparison.',
  { query: z.string().describe('Product to compare') },
  async ({ query }: { query: string }) => {
    const [tnt, mi9All, shopping] = await Promise.all([
      searchProducts(query, 3).catch(() => ({ total: 0, products: [] as any[] })),
      mi9CompareAcrossStores(query, 2),
      serperShoppingByStore(query, ['Walmart', 'Amazon', 'Costco'], 3),
    ]);

    const lines: string[] = [`"${query}" — FULL cross-store comparison\n`];

    // API stores
    lines.push('=== Direct API (real-time, exact prices) ===\n');
    lines.push('T&T:');
    if (tnt.products.length === 0) lines.push('  (no results)');
    for (const p of tnt.products) {
      const sale = p.onSale ? ` ${p.discountPercent.toFixed(0)}% off` : '';
      lines.push(`  ${p.name.slice(0, 40)} — $${p.finalPrice.toFixed(2)}${sale}`);
    }
    for (const { store, products } of mi9All) {
      lines.push(`\n${store}:`);
      if (products.length === 0) { lines.push('  (no results)'); continue; }
      for (const p of products) {
        const sale = p.onSale ? ` SALE` : '';
        lines.push(`  ${p.name.slice(0, 40)} — $${p.price.toFixed(2)}${sale}`);
      }
    }

    // Google Shopping stores
    lines.push('\n\n=== Google Shopping (cached, ~90% accurate) ===\n');
    for (const { store, products } of shopping) {
      lines.push(`${store}:`);
      if (products.length === 0) { lines.push('  (not found)'); continue; }
      for (const p of products) {
        lines.push(`  ${p.name.slice(0, 40)} — ${p.price}`);
      }
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
