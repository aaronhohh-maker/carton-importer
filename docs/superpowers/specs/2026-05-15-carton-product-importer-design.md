# +Carton Product Importer — Design Spec
**Date:** 2026-05-15
**Status:** Approved
**Author:** Aaron Hoh

---

## Overview

A web dashboard that lets Aaron paste a noissue.co URL, scrapes product content automatically, applies category-specific pricing templates, rewrites copy with AI, and creates a draft product in Shopify — without any manual data entry.

**Stack:** Next.js (Vercel) + Supabase (PostgreSQL + Edge Functions + Auth) + Shopify Custom App API + Claude API + Resend (email) + Playwright via Browserless.io (scraping)

> **Note on scraping:** Playwright cannot run inside Supabase Edge Functions (binary is ~300MB, Edge Functions have a 2MB bundle limit). Instead, the `scrape-product` Edge Function calls [Browserless.io](https://browserless.io) — a hosted headless Chrome service — over WebSocket. This keeps the bundle small and avoids deploying a browser binary entirely.

---

## Scope

### In Scope
- Single URL import
- Bulk CSV import (URL + category columns), overnight background processing
- Draft review mode — all products land as Shopify drafts
- Selective re-sync (field-level checkboxes)
- Margin calculator display before publishing
- Per-variant pricing tiers via `custom.pricing_tiers` metafield
- AI description rewriter (Claude, friendly/approachable tone)
- Auto-tagging + Shopify collection assignment
- SEO fields (meta title + meta description)
- Alt text generation for all images
- Detailed activity log (field-level old → new values)
- Undo/rollback (delete from Shopify, keep Supabase log)
- Email notifications to aaron@canteracap.com (bulk complete + failures)

### Out of Scope (Future)
- Box dimension-based pricing calculator
- Low stock alerts (all products are print-on-demand via noissue)
- Multi-supplier scraping (noissue.co only for now)
- User management UI (managed directly in Supabase dashboard)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Next.js (Vercel)                     │
│  Dashboard UI  ←→  API Routes (lightweight only)     │
└────────────────────────┬────────────────────────────┘
                         │ triggers
┌────────────────────────▼────────────────────────────┐
│              Supabase                                │
│  PostgreSQL DB  │  Edge Functions  │  Auth           │
│                 │                  │                 │
│  - products     │  scrape-product  │  Email/password │
│  - imports      │  process-import  │  (users managed │
│  - categories   │  bulk-processor  │   via Supabase  │
│  - activity_log │  resync-product  │   dashboard)    │
│  - size_tiers   │                  │                 │
└────────────────────────┬────────────────────────────┘
                         │ writes to
          ┌──────────────┴──────────────┐
          │                             │
┌─────────▼──────────┐      ┌──────────▼──────────┐
│   Shopify Admin    │      │   External Services  │
│   Custom App API   │      │                      │
│  - Create products │      │  Playwright (scrape) │
│  - Upload images   │      │  Claude API (AI)     │
│  - Set metafields  │      │  Resend (email)      │
└────────────────────┘      └─────────────────────┘
```

---

## Data Model

### `categories`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | e.g. "Food Papers" |
| shopify_collection_id | text | Existing Shopify collection |
| shopify_tag | text | e.g. "food-paper" |
| noissue_url_path | text | e.g. "/shop/food-papers/" |
| created_at | timestamptz | |

### `size_tiers`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| category_id | uuid | FK → categories |
| size_label | text | e.g. "190×190mm" |
| pricing_tiers | jsonb | `[{"min_qty":50,"price":30},...]` written to `custom.pricing_tiers` on each Shopify variant |
| created_at | timestamptz | |

### `imports`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| url | text | noissue.co source URL |
| category_id | uuid | FK → categories |
| status | text | pending / scraping / processing / draft / published / failed / deleted |
| shopify_product_id | text | Set after Shopify creation |
| source_data | jsonb | Raw scraped content |
| processed_data | jsonb | Final content before Shopify push |
| bulk_job_id | uuid | FK → bulk_jobs (null for single imports) |
| created_by | uuid | FK → auth.users |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `activity_log`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| import_id | uuid | FK → imports |
| action | text | imported / resynced / deleted / published |
| changed_fields | jsonb | `{"title": {"old": "...", "new": "..."}}` |
| triggered_by | uuid | FK → auth.users |
| created_at | timestamptz | |

### `bulk_jobs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| status | text | pending / running / complete / failed |
| total_urls | int | |
| completed | int | |
| failed | int | |
| csv_filename | text | |
| email_sent | boolean | |
| created_by | uuid | FK → auth.users |
| created_at | timestamptz | |
| finished_at | timestamptz | |

### `resync_selections`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| import_id | uuid | FK → imports |
| fields_selected | text[] | e.g. ["title", "description", "images"] |
| triggered_at | timestamptz | |
| triggered_by | uuid | FK → auth.users |

---

## Core Import Pipeline

1. **Submit** — Next.js API route receives URL + category, creates `imports` row with status `pending`, returns job ID immediately
2. **Scrape** — `scrape-product` Edge Function fires Playwright, loads noissue page fully, extracts: title, description, all image URLs, all variant size labels
3. **Price mapping** — System looks up `size_tiers` for the category. Each scraped size label matched to its configured pricing tiers. Unmatched sizes flagged for review before publish
4. **AI processing** — Claude rewrites description in +Carton's friendly/approachable tone, generates SEO meta title + meta description, writes descriptive alt text per image
5. **Image transfer** — All images downloaded from noissue, re-uploaded to Shopify Files API. noissue CDN URLs replaced with Shopify CDN URLs
6. **Shopify product creation** — Draft product created with: rewritten title + description, all variants (each with `custom.pricing_tiers` metafield), SEO fields, collection + tags, all images with alt text
7. **Log + notify** — Detailed activity log entry written. Bulk jobs: counter incremented, email sent on completion or failure

---

## Dashboard Pages

### 1. Import (Home)
- URL input + category dropdown (auto-detected from URL path, manually editable)
- Live status indicator: Scraping → Processing → Done
- Pricing tier preview before confirming: all quantity breakpoints and unit prices per variant size
- CSV upload for bulk jobs with per-URL queue progress

### 2. Products
- Table: name, category, status (draft/published/failed), date, source URL
- Actions per row: View in Shopify, Re-sync, Delete
- Re-sync modal with field checkboxes: Title, Description, Images, Variants, SEO Fields

### 3. Category Templates
- List of categories with their noissue URL path mappings
- Per category: master size-price table (size label + JSON tiers)
- Inline add/edit/delete of sizes
- Changes apply to future imports only

### 4. Activity Log
- Filterable by action type, date range, product
- Per row: product name, action, changed fields (old → new), triggered by, timestamp
- Expandable for full detail

### 5. Bulk Jobs
- History of all CSV batch imports
- Per job: filename, date, total/completed/failed counts, email sent status
- Drill-in view for per-URL status and error messages

---

## Shopify Custom App

**Setup:** Created once in Shopify Admin → Settings → Apps → Develop apps

**Required API scopes:**
- `write_products` — create and update products
- `read_products` — fetch existing product data for re-sync
- `write_product_listings` — manage draft/published status
- `write_files` — upload images to Shopify Files CDN
- `write_metafields` — set `custom.pricing_tiers` per variant

**Credentials stored in:** Vercel environment variables (`SHOPIFY_ADMIN_API_TOKEN`, `SHOPIFY_STORE_DOMAIN`)

---

## AI Integration (Claude)

**Tasks per import:**
1. **Description rewrite** — input: raw noissue description + product name. Output: friendly, approachable copy in +Carton's voice targeting small F&B businesses and cafes
2. **SEO meta title** — concise, keyword-relevant, under 60 characters
3. **SEO meta description** — compelling summary, under 160 characters
4. **Image alt text** — descriptive alt text per image for accessibility and SEO

**Model:** claude-sonnet-4-6 with prompt caching on the system prompt (brand voice instructions)

---

## Email Notifications

**Provider:** Resend
**Recipient:** aaron@canteracap.com
**Triggers:**
- Bulk job complete — summary of total imported, failed, with links to failures
- Any import failure — product name, source URL, error reason

---

## Future Features (Not In Scope Now)

- **Box pricing calculator** — dimension + ply + GSM formula (mirrors existing Google Sheet logic)
- **Multi-supplier support** — generic scraper for suppliers beyond noissue.co
- **Low stock alerts** — not applicable (all POD), revisit if model changes
