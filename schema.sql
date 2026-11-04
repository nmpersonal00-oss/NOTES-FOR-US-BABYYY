-- Petal Notes, a dedicated Supabase project. Run ONCE in that project's SQL Editor.
-- Every browser-exposed table has RLS. No reference-app project or data is reused.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique check (invite_code ~ '^[a-f0-9]{18}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('wife','hubby')),
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id),
  constraint one_garden_per_user unique(user_id),
  constraint one_person_per_role unique(room_id,role)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check(char_length(btrim(title)) between 1 and 72),
  body text not null default '' check(char_length(body)<=500),
  audience text not null default 'both' check(audience in ('both','wife','hubby')),
  repeat text not null default 'off' check(repeat in ('off','morning','afternoon','evening','custom')),
  remind_time text check (remind_time is null or remind_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  sticker text not null default 'book' check(sticker in ('book','snack','vitamins','letter','bunny','bear')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_room_idx on public.notes(room_id,created_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  local_day date not null,
  status text not null default 'sending',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint one_daily_delivery unique(note_id,subscription_id,local_day)
);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.notes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;

-- Explicit grants: Supabase's 2026 Data API changes may not auto-grant newly created tables.
revoke all on public.rooms,public.room_members,public.notes,public.push_subscriptions,public.push_deliveries from anon;
revoke all on public.rooms,public.room_members,public.notes,public.push_subscriptions,public.push_deliveries from authenticated;
grant select on public.rooms,public.room_members to authenticated;
grant select,insert,update,delete on public.notes,public.push_subscriptions to authenticated;
-- No unprivileged grants or policies on push_deliveries: only the server role can read/write it.

create policy "Members see only their own membership" on public.room_members
 for select to authenticated using (user_id=(select auth.uid()));
create policy "Members see their room" on public.rooms
 for select to authenticated using (exists (
   select 1 from public.room_members m where m.room_id=id and m.user_id=(select auth.uid())
 ));
create policy "Members see their room notes" on public.notes
 for select to authenticated using (exists (
   select 1 from public.room_members m where m.room_id=notes.room_id and m.user_id=(select auth.uid())
 ));
create policy "Members write notes in their room" on public.notes
 for insert to authenticated with check (
   created_by=(select auth.uid()) and exists (
     select 1 from public.room_members m where m.room_id=notes.room_id and m.user_id=(select auth.uid())
   )
 );
create policy "Members update room notes" on public.notes
 for update to authenticated
 using (exists (
   select 1 from public.room_members m where m.room_id=notes.room_id and m.user_id=(select auth.uid())
 )) with check (exists (
   select 1 from public.room_members m where m.room_id=notes.room_id and m.user_id=(select auth.uid())
 ));
create policy "Members delete room notes" on public.notes
 for delete to authenticated using (exists (
   select 1 from public.room_members m where m.room_id=notes.room_id and m.user_id=(select auth.uid())
 ));
create policy "My push subscriptions only" on public.push_subscriptions
 for select to authenticated using(user_id=(select auth.uid()));
create policy "I add my push subscriptions" on public.push_subscriptions
 for insert to authenticated with check(user_id=(select auth.uid()));
create policy "I edit my push subscriptions" on public.push_subscriptions
 for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "I delete my push subscriptions" on public.push_subscriptions
 for delete to authenticated using(user_id=(select auth.uid()));

-- A signed-in user creates one room. This privileged function handles the
-- atomic room + member transaction; access is explicitly limited to authenticated.
create or replace function public.create_couple_room(p_role text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid := auth.uid(); v_room uuid; v_code text;
begin
 if v_user is null then raise exception 'Please sign in first.'; end if;
 if p_role not in ('wife','hubby') then raise exception 'Choose Wifey or Hubby.'; end if;
 if exists(select 1 from public.room_members where user_id=v_user) then raise exception 'You already belong to a garden.'; end if;
 -- Random UUID bytes form a private, unguessable 18-character code.
 v_code:=substr(replace(gen_random_uuid()::text,'-',''),1,18);
 insert into public.rooms(invite_code,created_by) values(v_code,v_user) returning id into v_room;
 insert into public.room_members(room_id,user_id,role) values(v_room,v_user,p_role);
 return jsonb_build_object('room_id',v_room,'invite_code',v_code,'role',p_role);
end $$;

create or replace function public.join_couple_room(p_invite_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid := auth.uid(); v_room public.rooms%rowtype; v_role text;
begin
 if v_user is null then raise exception 'Please sign in first.'; end if;
 if exists(select 1 from public.room_members where user_id=v_user) then raise exception 'You already belong to a garden.'; end if;
 -- Lock room to serialize concurrent joins and enforce at most two people.
 select * into v_room from public.rooms where invite_code=lower(btrim(p_invite_code)) for update;
 if not found then raise exception 'We could not find that private code.'; end if;
 if (select count(*) from public.room_members where room_id=v_room.id)>=2 then
   raise exception 'This garden already has two hearts.';
 end if;
 if exists(select 1 from public.room_members where room_id=v_room.id and role='wife') then
   v_role:='hubby';
 else v_role:='wife'; end if;
 insert into public.room_members(room_id,user_id,role) values(v_room.id,v_user,v_role);
 return jsonb_build_object('room_id',v_room.id,'role',v_role);
end $$;
revoke all on function public.create_couple_room(text) from public,anon;
revoke all on function public.join_couple_room(text) from public,anon;
grant execute on function public.create_couple_room(text) to authenticated;
grant execute on function public.join_couple_room(text) to authenticated;

-- Keep room id and original author immutable even when editing a note.
create or replace function public.stamp_note_update()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.room_id is distinct from old.room_id or new.created_by is distinct from old.created_by then
   raise exception 'Cannot move a note into another room or change its author.';
 end if;
 new.updated_at=now();
 return new;
end $$;
create trigger notes_stamp_update before update on public.notes
for each row execute function public.stamp_note_update();

-- Postgres Realtime delivers changes; SELECT RLS still limits exposure to room members.
alter publication supabase_realtime add table public.notes;
