create extension if not exists pgcrypto;

create table if not exists public.cloud_documents (
  id uuid primary key default gen_random_uuid(),
  browser_key text,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default 'Untitled document',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cloud_documents
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.cloud_documents
  alter column browser_key drop not null;

create index if not exists cloud_documents_browser_key_idx
  on public.cloud_documents (browser_key, updated_at desc);

create index if not exists cloud_documents_user_id_idx
  on public.cloud_documents (user_id, updated_at desc);

insert into storage.buckets (id, name, public)
values ('colora-files', 'colora-files', false)
on conflict (id) do nothing;

create or replace function public.set_cloud_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cloud_documents_set_updated_at on public.cloud_documents;

create trigger cloud_documents_set_updated_at
before update on public.cloud_documents
for each row
execute function public.set_cloud_documents_updated_at();
