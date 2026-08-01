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

-- SONG FILES v2: one file per song may be flagged the "master" (the current
-- most-complete version). Setting a new master clears the song's previous one.
alter table public.song_files add column if not exists is_master boolean not null default false;

-- SONG FILES v2 (idea bank + labels): song_id becomes nullable so a file can
-- live in the album-level idea bank (unassigned). album_id links every file to
-- its album (so bank files are reachable). labels = section/instrument tags.
alter table public.song_files add column if not exists labels text[] not null default '{}';
alter table public.song_files add column if not exists album_id uuid references public.albums (id) on delete cascade;
alter table public.song_files alter column song_id drop not null;

-- Backfill album_id for existing song-linked files.
update public.song_files f
  set album_id = s.album_id
  from public.songs s
  where f.song_id = s.id and f.album_id is null;

-- Broaden RLS: a file is accessible if the user owns it via its song OR (for
-- bank files with no song) directly via its album.
drop policy if exists "song_files: via owned album" on public.song_files;
create policy "song_files: via owned album"
  on public.song_files for all
  using (
    (song_id is not null and exists (
      select 1 from public.songs s join public.albums a on a.id = s.album_id
      where s.id = song_files.song_id and a.owner_id = auth.uid()))
    or (album_id is not null and exists (
      select 1 from public.albums a
      where a.id = song_files.album_id and a.owner_id = auth.uid()))
  )
  with check (
    (song_id is not null and exists (
      select 1 from public.songs s join public.albums a on a.id = s.album_id
      where s.id = song_files.song_id and a.owner_id = auth.uid()))
    or (album_id is not null and exists (
      select 1 from public.albums a
      where a.id = song_files.album_id and a.owner_id = auth.uid()))
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
-- RECORDING GRID v2: albums.instruments is now the per-album set of grid
-- columns (dynamic — add/rename/delete). New albums start blank (the API
-- inserts an empty array). Backfill existing albums that already have grid
-- data with the legacy fixed columns so their cells keep their columns.
-- ---------------------------------------------------------------------------
update public.albums a
set instruments = array['Drums','Bass','Guitar','Synth','Lead Vox','BGV']
where exists (
  select 1 from public.songs s
  join public.song_tracks t on t.song_id = s.id
  where s.album_id = a.id
);

-- ---------------------------------------------------------------------------
-- MERCH ITEMS  (full records — v2. Each item = a garment/product with its own
-- mockup + print-ready files, budget, brand/style, color, sizes, vendor.)
-- ---------------------------------------------------------------------------
create table if not exists public.merch_items (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  name text not null default 'New item',
  brand text default '',           -- e.g. "Gildan 5000" / "Bella+Canvas 3001"
  color text default '',
  sizes text[] not null default '{}',   -- e.g. {S,M,L,XL}
  has_sizes boolean not null default true,
  budget numeric,                  -- dollars
  vendor text default '',
  vendor_link text default '',
  mockup_key text,                 -- R2 key for the mockup image
  print_key text,                  -- R2 key for print-ready / full-res artwork
  size_qty jsonb not null default '{}'::jsonb,  -- { S: 10, M: 20, ... } (apparel)
  total_qty int,                   -- total units for non-apparel (e.g. 100 posters)
  position int not null default 0,
  created_at timestamptz default now()
);
-- (if merch_items already existed, add the v2 quantity columns)
alter table public.merch_items add column if not exists size_qty jsonb not null default '{}'::jsonb;
alter table public.merch_items add column if not exists total_qty int;
alter table public.merch_items enable row level security;
drop policy if exists "merch_items: via owned album" on public.merch_items;
create policy "merch_items: via owned album" on public.merch_items for all
  using (exists (select 1 from public.albums a where a.id = merch_items.album_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.albums a where a.id = merch_items.album_id and a.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- ARTWORK PIECES (v2.4): arbitrary artwork items with custom/preset labels,
-- split into a "working" set (in_pool=false) and an alternates "pool"
-- (in_pool=true). Replaces the old fixed 5-slot album_assets artwork.
-- ---------------------------------------------------------------------------
create table if not exists public.artwork_pieces (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  label text default '',
  r2_key text,
  in_pool boolean not null default false,
  position int not null default 0,
  created_at timestamptz default now()
);
alter table public.artwork_pieces enable row level security;
drop policy if exists "artwork_pieces: via owned album" on public.artwork_pieces;
create policy "artwork_pieces: via owned album" on public.artwork_pieces for all
  using (exists (select 1 from public.albums a where a.id = artwork_pieces.album_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.albums a where a.id = artwork_pieces.album_id and a.owner_id = auth.uid()));
grant select, insert, update, delete on public.artwork_pieces to authenticated;

-- One-time migration of legacy fixed-slot artwork into artwork_pieces (guarded
-- so re-running does not duplicate).
insert into public.artwork_pieces (album_id, label, r2_key, in_pool, position)
select a.album_id,
  case a.slot when 0 then 'Front cover' when 1 then 'Inside / gatefold'
              when 2 then 'Back cover'  when 3 then 'Vinyl label'
              when 4 then 'Insert / lyric sheet' else 'Artwork' end,
  a.r2_key, false, a.slot
from public.album_assets a
where a.kind = 'artwork' and a.r2_key is not null
  and not exists (select 1 from public.artwork_pieces p
                  where p.album_id = a.album_id and p.r2_key = a.r2_key);

-- ---------------------------------------------------------------------------
-- ALBUM EXTRAS: public share link, release date, saved schedule
-- ---------------------------------------------------------------------------
alter table public.albums add column if not exists share_id uuid default gen_random_uuid();
alter table public.albums add column if not exists release_date date;
alter table public.albums add column if not exists schedule jsonb default '[]'::jsonb;

-- SONG EXTRAS: references + credits (JSON arrays)
alter table public.songs add column if not exists refs jsonb default '[]'::jsonb;
alter table public.songs add column if not exists credits jsonb default '[]'::jsonb;

-- v2: single per-song artwork (pre-release single cover). Surfaces in the album
-- artwork section labeled with the song name.
alter table public.songs add column if not exists artwork_key text;

-- v2: per-album editable label tag sets (song sections + instruments) used by
-- the idea/file label chips. Defaults match the original hardcoded sets.
alter table public.albums add column if not exists section_tags text[] not null default array['Intro','Verse','Chorus','Bridge','Hook','Outro'];
alter table public.albums add column if not exists instrument_tags text[] not null default array['Guitar','Bass','Drums','Synth','Vox','Keys','Perc','FX'];

-- ARTIST PHOTOS (band photo / logo, keyed per owner + artist slug)
create table if not exists public.artist_photos (
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  r2_key text not null,
  created_at timestamptz default now(),
  primary key (owner_id, slug)
);
alter table public.artist_photos enable row level security;
drop policy if exists "artist_photos: owner" on public.artist_photos;
create policy "artist_photos: owner" on public.artist_photos for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ALBUM MEMBERS (owner-managed roster)
create table if not exists public.album_members (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  name text not null,
  initials text,
  color text,
  status text not null default 'pending',
  created_at timestamptz default now()
);
alter table public.album_members enable row level security;
drop policy if exists "album_members: via owned album" on public.album_members;
create policy "album_members: via owned album" on public.album_members for all
  using (exists (select 1 from public.albums a where a.id = album_members.album_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.albums a where a.id = album_members.album_id and a.owner_id = auth.uid()));

-- SONG COMMENTS (timestamped)
create table if not exists public.song_comments (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  author text not null,
  color text,
  stamp text,
  body text not null,
  created_at timestamptz default now()
);
-- v2: comments attach to a specific audio file (so waveform markers line up).
alter table public.song_comments add column if not exists file_id uuid references public.song_files (id) on delete cascade;
alter table public.song_comments enable row level security;
drop policy if exists "song_comments: via owned album" on public.song_comments;
create policy "song_comments: via owned album" on public.song_comments for all
  using (exists (select 1 from public.songs s join public.albums a on a.id = s.album_id where s.id = song_comments.song_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.songs s join public.albums a on a.id = s.album_id where s.id = song_comments.song_id and a.owner_id = auth.uid()));

-- ACTIVITY FEED
create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  actor text,
  body text not null,
  created_at timestamptz default now()
);
alter table public.activity enable row level security;
drop policy if exists "activity: via owned album" on public.activity;
create policy "activity: via owned album" on public.activity for all
  using (exists (select 1 from public.albums a where a.id = activity.album_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.albums a where a.id = activity.album_id and a.owner_id = auth.uid()));

-- Backfill: give every existing album an owner "in" member if it has none.
insert into public.album_members (album_id, name, initials, color, status)
select a.id,
       coalesce(p.display_name, 'You'),
       upper(left(coalesce(p.display_name, 'Yo'), 2)),
       '#FF4D1C',
       'in'
from public.albums a
left join public.profiles p on p.id = a.owner_id
where not exists (select 1 from public.album_members m where m.album_id = a.id);

-- ---------------------------------------------------------------------------
-- GRANTS  (explicit, so this works even with "expose new tables" turned off)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.profiles, public.albums, public.songs, public.song_tracks,
     public.song_files, public.album_assets, public.artist_photos,
     public.album_members, public.song_comments, public.activity,
     public.merch_items
  to authenticated;
