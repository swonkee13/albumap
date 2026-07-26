-- albumap database schema — run once in Supabase → SQL Editor.
-- Safe to re-run (uses "if not exists" / "drop ... if exists").
--
-- Security model (matches PROJECT_STATE.md): every table has Row Level
-- Security ON, only the AUTHENTICATED role is granted access, and each policy
-- limits rows to the album owner. Anonymous visitors get nothing.

-- ---------------------------------------------------------------------------
-- PROFILES  (one row per user, auto-created on signup)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: owner can read" on public.profiles;
create policy "profiles: owner can read"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles: owner can update" on public.profiles;
create policy "profiles: owner can update"
  on public.profiles for update using (auth.uid() = id);

-- Create a profile automatically whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- ALBUMS
-- ---------------------------------------------------------------------------
create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  artist text default '',
  instruments text[] not null default array['Drums','Bass','Guitar','Vocals','Keys'],
  created_at timestamptz default now()
);

alter table public.albums enable row level security;

drop policy if exists "albums: owner all" on public.albums;
create policy "albums: owner all"
  on public.albums for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- SONGS
-- ---------------------------------------------------------------------------
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  title text not null,
  position int not null default 0,
  created_at timestamptz default now()
);

alter table public.songs enable row level security;

drop policy if exists "songs: via owned album" on public.songs;
create policy "songs: via owned album"
  on public.songs for all
  using (
    exists (
      select 1 from public.albums a
      where a.id = songs.album_id and a.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.albums a
      where a.id = songs.album_id and a.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- SONG TRACKS  (the recording-grid cells: one per song x instrument)
-- ---------------------------------------------------------------------------
create table if not exists public.song_tracks (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  instrument text not null,
  status text not null default 'not_started',
  updated_at timestamptz default now(),
  unique (song_id, instrument)
);

alter table public.song_tracks enable row level security;

drop policy if exists "tracks: via owned album" on public.song_tracks;
create policy "tracks: via owned album"
  on public.song_tracks for all
  using (
    exists (
      select 1 from public.songs s
      join public.albums a on a.id = s.album_id
      where s.id = song_tracks.song_id and a.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.songs s
      join public.albums a on a.id = s.album_id
      where s.id = song_tracks.song_id and a.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- SONG FILES  (audio ideas/demos — bytes live in Cloudflare R2, metadata here)
-- ---------------------------------------------------------------------------
create table if not exists public.song_files (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  name text not null,
  fmt text,
  r2_key text not null,
  size bigint,
  duration double precision,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz default now()
);

alter table public.song_files enable row level security;

drop policy if exists "song_files: via owned album" on public.song_files;
create policy "song_files: via owned album"
  on public.song_files for all
  using (
    exists (
      select 1 from public.songs s
      join public.albums a on a.id = s.album_id
      where s.id = song_files.song_id and a.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.songs s
      join public.albums a on a.id = s.album_id
      where s.id = song_files.song_id and a.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- SONG WRITING  (lyrics + notes live on the song row)
-- ---------------------------------------------------------------------------
alter table public.songs add column if not exists lyrics text;
alter table public.songs add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- ALBUM ASSETS  (artwork + merch images — bytes in R2, one row per slot)
-- ---------------------------------------------------------------------------
create table if not exists public.album_assets (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  kind text not null,          -- 'artwork' | 'merch'
  slot int not null,           -- 0..4
  r2_key text not null,
  created_at timestamptz default now(),
  unique (album_id, kind, slot)
);

alter table public.album_assets enable row level security;

drop policy if exists "album_assets: via owned album" on public.album_assets;
create policy "album_assets: via owned album"
  on public.album_assets for all
  using (
    exists (
      select 1 from public.albums a
      where a.id = album_assets.album_id and a.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.albums a
      where a.id = album_assets.album_id and a.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- GRANTS  (explicit, so this works even with "expose new tables" turned off)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.profiles, public.albums, public.songs, public.song_tracks,
     public.song_files, public.album_assets
  to authenticated;
