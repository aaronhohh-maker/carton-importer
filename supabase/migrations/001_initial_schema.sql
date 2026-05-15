-- Categories: one row per product type
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shopify_collection_id text,
  shopify_tag text,
  noissue_url_path text,
  created_at timestamptz default now()
);

-- Size tiers: master size→price table per category
create table size_tiers (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  size_label text not null,
  pricing_tiers jsonb not null,
  created_at timestamptz default now(),
  unique(category_id, size_label)
);

-- Bulk jobs: tracks overnight CSV batch runs
create table bulk_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','running','complete','failed')),
  total_urls int not null default 0,
  completed int not null default 0,
  failed int not null default 0,
  csv_filename text,
  email_sent boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  finished_at timestamptz
);

-- Imports: every URL ever submitted
create table imports (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  category_id uuid references categories(id),
  status text not null default 'pending' check (status in ('pending','scraping','processing','draft','published','failed','deleted')),
  shopify_product_id text,
  source_data jsonb,
  processed_data jsonb,
  bulk_job_id uuid references bulk_jobs(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Activity log: field-level change history
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references imports(id),
  action text not null check (action in ('imported','resynced','published','deleted')),
  changed_fields jsonb,
  triggered_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Resync selections: tracks which fields were chosen per resync
create table resync_selections (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports(id),
  fields_selected text[] not null,
  triggered_at timestamptz default now(),
  triggered_by uuid references auth.users(id)
);

-- Auto-update updated_at on imports
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger imports_updated_at
  before update on imports
  for each row execute function update_updated_at();

-- RLS: only authenticated users
alter table categories enable row level security;
alter table size_tiers enable row level security;
alter table imports enable row level security;
alter table activity_log enable row level security;
alter table bulk_jobs enable row level security;
alter table resync_selections enable row level security;

create policy "authenticated_all" on categories for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on size_tiers for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on imports for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on activity_log for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on bulk_jobs for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on resync_selections for all using (auth.role() = 'authenticated');
