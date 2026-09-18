create extension if not exists "pgcrypto";

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('admin','manager','staff')),
  branch_id uuid references public.branches(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  storage_path text not null,
  original_storage_path text,
  note text not null default '',
  edges_detected boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace view public.profiles_with_branch with (security_invoker=true) as
select p.id,p.email,p.full_name,p.role,p.branch_id,b.name branch_name,p.active,p.created_at
from public.profiles p left join public.branches b on b.id=p.branch_id;

create or replace view public.receipts_with_details with (security_invoker=true) as
select r.id,r.user_id,p.full_name user_name,r.branch_id,b.name branch_name,r.storage_path,r.original_storage_path,r.note,r.edges_detected,r.created_at
from public.receipts r join public.profiles p on p.id=r.user_id left join public.branches b on b.id=r.branch_id;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,full_name,role,branch_id)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.raw_user_meta_data->>'role','staff'),nullif(new.raw_user_meta_data->>'branch_id','')::uuid)
  on conflict(id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.current_branch() returns uuid language sql stable security definer set search_path=public as $$ select branch_id from public.profiles where id=auth.uid() $$;

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.receipts enable row level security;

drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches for select to authenticated using(true);
drop policy if exists branches_admin_write on public.branches;
create policy branches_admin_write on public.branches for all to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.current_role() in ('admin','manager'));
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');

drop policy if exists receipts_read on public.receipts;
create policy receipts_read on public.receipts for select to authenticated using(public.current_role() in ('admin','manager') or branch_id=public.current_branch() or user_id=auth.uid());
drop policy if exists receipts_insert on public.receipts;
create policy receipts_insert on public.receipts for insert to authenticated with check(user_id=auth.uid() and (branch_id=public.current_branch() or branch_id is null));
drop policy if exists receipts_delete on public.receipts;
create policy receipts_delete on public.receipts for delete to authenticated using(public.current_role() in ('admin','manager') or user_id=auth.uid());

grant usage on schema public to authenticated;
grant select on public.branches to authenticated;
grant select on public.profiles to authenticated;
grant update(active) on public.profiles to authenticated;
grant select,insert,delete on public.receipts to authenticated;
grant select on public.profiles_with_branch to authenticated;
grant select on public.receipts_with_details to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_branch() to authenticated;

insert into storage.buckets(id,name,public) values('receipts','receipts',false) on conflict(id) do update set public=false;
drop policy if exists receipt_storage_read on storage.objects;
create policy receipt_storage_read on storage.objects for select to authenticated using(bucket_id='receipts');
drop policy if exists receipt_storage_insert on storage.objects;
create policy receipt_storage_insert on storage.objects for insert to authenticated with check(bucket_id='receipts' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists receipt_storage_delete on storage.objects;
create policy receipt_storage_delete on storage.objects for delete to authenticated using(bucket_id='receipts' and ((storage.foldername(name))[1]=auth.uid()::text or public.current_role() in ('admin','manager')));

insert into public.branches(name,code) values('Merkez','MRK') on conflict(name) do nothing;
