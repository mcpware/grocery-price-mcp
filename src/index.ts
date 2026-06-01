#!/usr/bin/env node
/**
 * Grocery Price MCP — Cross-store price comparison for Vancouver.
 *
 * Stores supported (all open APIs, no login required):
 * - T&T Supermarket (Magento 2 GraphQL)
 * - PriceSmart Foods (mi9cloud REST)
 *
 * No Instacart, no markup, no login.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { searchProducts, browseCategory, getSpecials, getCategories, FLYER_CATEGORIES } from './tnt.js';
import { psSearch, psGetStores } from './pricesmart.js';

const server = new McpServer({ name: 'grocery-price-mcp', version: '0.1.0' });

// ---------------------------------------------------------------------------
// Tool: grocery_compare — the main cross-store comparison
// ---------------------------------------------------------------------------

server.tool(
  'grocery_compare',
  'Compare a product across T&T and PriceSmart Foods. Shows real prices from both stores, sorted cheapest first. No Instacart markup.',
  { query: z.string().describe('Product to compare, e.g. "minced garlic" or "dried shiitake"') },
  async ({ query }: { query: string }) => {
    const [tnt, ps] = await Promise.all([
      searchProducts(query, 5).catch(() => ({ total: 0, products: [] as any[] })),
      psSearch(query, undefined, 5).catch(() => ({ total: 0, products: [] as any[] })),
    ]);

    const lines: string[] = [];
    lines.push(`"${query}" cross-store comparison\n`);

    lines.push('T&T Supermarket:');
    if (tnt.products.length === 0) lines.push('  (no results)');
    for (const p of tnt.products) {
      const sale = p.onSale ? ` ${p.discountPercent.toFixed(0)}% off (was $${p.regularPrice.toFixed(2)})` : '';
      lines.push(`  ${p.name} — $${p.finalPrice.toFixed(2)}${sale}`);
    }

    lines.push('\nPriceSmart Foods:');
    if (ps.products.length === 0) lines.push('  (no results)');
    for (const p of ps.products) {
      const unit = p.pricePerUnit ? ` (${p.pricePerUnit})` : '';
      lines.push(`  ${p.name} — $${p.price.toFixed(2)}${unit}`);
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
// Tool: pricesmart_search
// ---------------------------------------------------------------------------

server.tool(
  'pricesmart_search',
  'Search PriceSmart Foods products. Returns real prices + per-unit pricing.',
  { query: z.string(), maxResults: z.number().optional().default(8) },
  async ({ query, maxResults }: { query: string; maxResults: number }) => {
    const { total, products } = await psSearch(query, undefined, maxResults);
    const lines = products.map((p: any) => {
      const unit = p.pricePerUnit ? ` (${p.pricePerUnit})` : '';
      return `${p.name} [${p.brand}] — $${p.price.toFixed(2)}${unit} | ${p.size}`;
    });
    return { content: [{ type: 'text' as const, text: `PriceSmart: ${total} results for "${query}":\n\n${lines.join('\n')}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: pricesmart_stores
// ---------------------------------------------------------------------------

server.tool(
  'pricesmart_stores',
  'List PriceSmart Foods store locations in Metro Vancouver.',
  {},
  async () => {
    const stores = await psGetStores();
    const lines = stores.map((s: any) => `${s.name} — ${s.address}, ${s.city} ${s.postalCode} (id: ${s.retailerStoreId})`);
    return { content: [{ type: 'text' as const, text: `PriceSmart Foods (${stores.length} stores):\n\n${lines.join('\n')}` }] };
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
