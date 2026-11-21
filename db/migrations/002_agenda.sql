-- Iteración 2: disponibilidad del PT, bloqueos y reservas.
--
-- Reglas de negocio (viven en la base para que ninguna pantalla pueda saltárselas):
--  - Clases de 1 hora, de a un alumno por horario. Una exclusión en Postgres impide la doble reserva.
--  - El PT define tramos semanales (por defecto lunes a viernes, 06:00 a 22:00) y bloqueos puntuales.
--  - El alumno reserva solo en horarios libres, a futuro y hasta 56 días adelante.
--  - El alumno cancela con 24 horas o más de anticipación; después ya no puede.
--  - El PT puede cancelar una clase futura en cualquier momento.
--  - Todos los horarios se interpretan en America/Santiago.
--
-- Requiere la extensión btree_gist (se crea con el usuario dueño/superusuario de la migración).

create extension if not exists btree_gist;

create function app_tz() returns text language sql immutable as $$ select 'America/Santiago'::text $$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
-- weekday en formato ISO: 1 = lunes … 7 = domingo. Un día puede tener varios tramos (p. ej. con pausa de almuerzo).
create table availability_rules (
  id         uuid primary key default gen_random_uuid(),
  pt_id      text not null references pt_profiles(user_id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  start_hour smallint not null check (start_hour between 0 and 23),
  end_hour   smallint not null check (end_hour between 1 and 24),
  created_at timestamptz not null default now(),
  check (end_hour > start_hour),
  exclude using gist (pt_id with =, weekday with =, int4range(start_hour, end_hour) with &&)
);

-- Bloqueo de horas de una fecha concreta (vacaciones, trámites). Día completo = 0 a 24.
create table availability_blocks (
  id         uuid primary key default gen_random_uuid(),
  pt_id      text not null references pt_profiles(user_id) on delete cascade,
  block_date date not null,
  start_hour smallint not null check (start_hour between 0 and 23),
  end_hour   smallint not null check (end_hour between 1 and 24),
  reason     text check (reason is null or length(reason) <= 120),
  created_at timestamptz not null default now(),
  check (end_hour > start_hour)
);
create index availability_blocks_pt_date_idx on availability_blocks (pt_id, block_date);

create table bookings (
  id            uuid primary key default gen_random_uuid(),
  pt_id         text not null references pt_profiles(user_id) on delete cascade,
  student_id    text not null references students(user_id) on delete cascade,
  location_id   uuid,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  status        text not null default 'booked' check (status in ('booked', 'cancelled_student', 'cancelled_pt')),
  cancelled_at  timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 200),
  created_at    timestamptz not null default now(),
  check (end_at - start_at = interval '1 hour'),
  foreign key (location_id, pt_id) references locations (id, pt_id),
  -- Un PT no puede tener dos clases vigentes que se pisen.
  exclude using gist (pt_id with =, tstzrange(start_at, end_at) with &&) where (status = 'booked')
);
create index bookings_student_idx on bookings (student_id, start_at);
create index bookings_pt_idx on bookings (pt_id, start_at);

-- ---------------------------------------------------------------------------
-- Horarios por defecto para cada PT nuevo (y para los que ya existen)
-- ---------------------------------------------------------------------------
create or replace function register_pt(
  p_user_id text, p_email text, p_name text, p_password_hash text, p_phone text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into "user" (id, name, email, role) values (p_user_id, p_name, lower(p_email), 'pt');
  insert into account (id, "accountId", "providerId", "userId", password)
  values (gen_random_uuid()::text, p_user_id, 'credential', p_user_id, p_password_hash);
  insert into pt_profiles (user_id, display_name, phone) values (p_user_id, p_name, p_phone);
  insert into availability_rules (pt_id, weekday, start_hour, end_hour)
  select p_user_id, d, 6, 22 from generate_series(1, 5) as d;
  perform log_audit(p_user_id, 'pt.registered', 'user', p_user_id);
end $$;

insert into availability_rules (pt_id, weekday, start_hour, end_hour)
select p.user_id, d, 6, 22
  from pt_profiles p cross join generate_series(1, 5) as d
 where not exists (select 1 from availability_rules r where r.pt_id = p.user_id);

-- ---------------------------------------------------------------------------
-- Funciones
-- ---------------------------------------------------------------------------
-- Horarios de un rango de fechas locales (máximo 63 días), para el PT que llama o para el PT de su alumno.
--  PT:     free | booked (con alumno y lugar) | blocked | past
--  Alumno: free | mine | unavailable. Solo futuro, hasta 56 días. Nunca ve datos de otros alumnos.
create function list_slots(p_from date, p_to date)
returns table (
  slot_start timestamptz, slot_date date, slot_hour int, slot_state text,
  slot_booking_id uuid, slot_student_id text, slot_student_name text, slot_location_name text,
  slot_is_past boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  v_role text;
  v_pt   text;
begin
  if v_user is null then return; end if;
  select u.role into v_role from "user" u where u.id = v_user;
  if v_role = 'pt' then
    v_pt := v_user;
  elsif v_role = 'student' then
    select s.pt_id into v_pt from students s where s.user_id = v_user;
  end if;
  if v_pt is null then return; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'range_invalid'; end if;

  return query
  with cand as (
    select make_timestamptz(extract(year from g.d)::int, extract(month from g.d)::int,
                            extract(day from g.d)::int, hh.h::int, 0, 0, app_tz()) as st
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g(d)
      join availability_rules r on r.pt_id = v_pt and r.weekday = extract(isodow from g.d)::int
      cross join lateral generate_series(r.start_hour, r.end_hour - 1) as hh(h)
    union
    -- Clases ya reservadas fuera de los tramos actuales (si el PT cambió su horario después).
    select b.start_at
      from bookings b
     where b.pt_id = v_pt and b.status = 'booked'
       and (b.start_at at time zone app_tz())::date between p_from and p_to
  ),
  loc as (select c.st, (c.st at time zone app_tz()) as lt from cand c)
  select l.st, l.lt::date, extract(hour from l.lt)::int,
         case
           when b.id is not null then
             case when v_role = 'pt' then 'booked'
                  when b.student_id = v_user then 'mine'
                  else 'unavailable' end
           when exists (select 1 from availability_blocks k
                         where k.pt_id = v_pt and k.block_date = l.lt::date
                           and extract(hour from l.lt)::int >= k.start_hour
                           and extract(hour from l.lt)::int <  k.end_hour) then
             case when v_role = 'pt' then 'blocked' else 'unavailable' end
           when l.st <= now() then 'past'
           else 'free'
         end,
         b.id, b.student_id, su.name, lo.name, (l.st <= now())
    from loc l
    left join bookings b on b.pt_id = v_pt and b.status = 'booked' and b.start_at = l.st
    left join "user" su on su.id = b.student_id and v_role = 'pt'
    left join locations lo on lo.id = b.location_id and v_role = 'pt'
   where v_role = 'pt' or (l.st > now() and l.st <= now() + interval '56 days')
   order by l.st;
end $$;

-- Reservar una clase. Errores: not_student, slot_invalid, slot_past, slot_too_far, slot_unavailable, slot_taken.
create function book_class(p_start timestamptz) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user  text := app_user_id();
  v_pt    text;
  v_loc   uuid;
  v_local timestamp;
  v_date  date;
  v_hour  int;
  v_id    uuid;
begin
  select s.pt_id, s.location_id into v_pt, v_loc from students s where s.user_id = v_user;
  if v_user is null or v_pt is null then raise exception 'not_student'; end if;

  v_local := p_start at time zone app_tz();
  if date_trunc('hour', v_local) <> v_local then raise exception 'slot_invalid'; end if;
  if p_start <= now() then raise exception 'slot_past'; end if;
  if p_start > now() + interval '56 days' then raise exception 'slot_too_far'; end if;

  v_date := v_local::date;
  v_hour := extract(hour from v_local)::int;
  if not exists (select 1 from availability_rules r
                  where r.pt_id = v_pt and r.weekday = extract(isodow from v_local)::int
                    and v_hour >= r.start_hour and v_hour < r.end_hour)
     or exists (select 1 from availability_blocks k
                 where k.pt_id = v_pt and k.block_date = v_date
                   and v_hour >= k.start_hour and v_hour < k.end_hour) then
    raise exception 'slot_unavailable';
  end if;

  begin
    insert into bookings (pt_id, student_id, location_id, start_at, end_at)
    values (v_pt, v_user, v_loc, p_start, p_start + interval '1 hour')
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  perform log_audit(v_user, 'booking.created', 'booking', v_id::text, jsonb_build_object('start_at', p_start));
  return v_id;
end $$;

-- Cancelar una clase. El alumno solo con 24 horas o más de anticipación; el PT, mientras no haya empezado.
-- Errores: booking_not_found, booking_not_active, too_late, booking_past.
create function cancel_booking(p_id uuid, p_reason text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  v_role text;
  b      bookings%rowtype;
begin
  select u.role into v_role from "user" u where u.id = v_user;
  select * into b from bookings where id = p_id for update;
  if v_role is null or not found then raise exception 'booking_not_found'; end if;

  if v_role = 'student' and b.student_id = v_user then
    if b.status <> 'booked' then raise exception 'booking_not_active'; end if;
    if b.start_at - now() < interval '24 hours' then raise exception 'too_late'; end if;
    update bookings set status = 'cancelled_student', cancelled_at = now() where id = b.id;
    perform log_audit(v_user, 'booking.cancelled_by_student', 'booking', b.id::text,
                      jsonb_build_object('start_at', b.start_at));
    return 'cancelled_student';
  elsif v_role = 'pt' and b.pt_id = v_user then
    if b.status <> 'booked' then raise exception 'booking_not_active'; end if;
    if b.start_at <= now() then raise exception 'booking_past'; end if;
    update bookings
       set status = 'cancelled_pt', cancelled_at = now(), cancel_reason = left(nullif(trim(p_reason), ''), 200)
     where id = b.id;
    perform log_audit(v_user, 'booking.cancelled_by_pt', 'booking', b.id::text,
                      jsonb_build_object('start_at', b.start_at));
    return 'cancelled_pt';
  end if;
  raise exception 'booking_not_found';
end $$;

-- Cuántas clases reservadas caen dentro de un bloqueo que el PT quiere crear.
create function count_block_conflicts(p_date date, p_start int, p_end int) returns int
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  v_n    int;
begin
  if not exists (select 1 from pt_profiles where user_id = v_user) then raise exception 'not_pt'; end if;
  select count(*)::int into v_n
    from bookings b
   where b.pt_id = v_user and b.status = 'booked' and b.start_at > now()
     and (b.start_at at time zone app_tz())::date = p_date
     and extract(hour from (b.start_at at time zone app_tz()))::int >= p_start
     and extract(hour from (b.start_at at time zone app_tz()))::int <  p_end;
  return v_n;
end $$;

-- Bloquea horas de una fecha y cancela las clases que caían ahí. Devuelve las clases canceladas.
-- Errores: not_pt, block_invalid, block_past.
create function block_range(p_date date, p_start int, p_end int, p_reason text default null)
returns table (cancelled_booking uuid, cancelled_student text, cancelled_start timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user   text := app_user_id();
  v_reason text := left(nullif(trim(p_reason), ''), 120);
  v_id     uuid;
  v_n      int;
begin
  if not exists (select 1 from pt_profiles where user_id = v_user) then raise exception 'not_pt'; end if;
  if p_start is null or p_end is null or p_start < 0 or p_end > 24 or p_end <= p_start then
    raise exception 'block_invalid';
  end if;
  if p_date < (now() at time zone app_tz())::date then raise exception 'block_past'; end if;

  insert into availability_blocks (pt_id, block_date, start_hour, end_hour, reason)
  values (v_user, p_date, p_start, p_end, v_reason)
  returning id into v_id;
  perform log_audit(v_user, 'availability.blocked', 'availability_block', v_id::text,
                    jsonb_build_object('date', p_date, 'start_hour', p_start, 'end_hour', p_end));

  v_n := count_block_conflicts(p_date, p_start, p_end);

  return query
  with cancelled as (
    update bookings b
       set status = 'cancelled_pt', cancelled_at = now(),
           cancel_reason = coalesce(v_reason, 'Bloqueo de agenda')
     where b.pt_id = v_user and b.status = 'booked' and b.start_at > now()
       and (b.start_at at time zone app_tz())::date = p_date
       and extract(hour from (b.start_at at time zone app_tz()))::int >= p_start
       and extract(hour from (b.start_at at time zone app_tz()))::int <  p_end
    returning b.id, b.student_id, b.start_at
  )
  select c.id, c.student_id, c.start_at from cancelled c order by c.start_at;

  if v_n > 0 then
    perform log_audit(v_user, 'booking.cancelled_by_pt', 'booking', null,
                      jsonb_build_object('reason', 'block', 'block_id', v_id, 'count', v_n));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Permisos y Row Level Security
-- ---------------------------------------------------------------------------
revoke all on function list_slots(date, date) from public;
revoke all on function book_class(timestamptz) from public;
revoke all on function cancel_booking(uuid, text) from public;
revoke all on function count_block_conflicts(date, int, int) from public;
revoke all on function block_range(date, int, int, text) from public;
grant execute on function list_slots(date, date) to ptagenda_app;
grant execute on function book_class(timestamptz) to ptagenda_app;
grant execute on function cancel_booking(uuid, text) to ptagenda_app;
grant execute on function count_block_conflicts(date, int, int) to ptagenda_app;
grant execute on function block_range(date, int, int, text) to ptagenda_app;
grant execute on function app_tz() to ptagenda_app;

grant select, insert, delete on availability_rules to ptagenda_app;
grant select, insert, delete on availability_blocks to ptagenda_app;
grant select on bookings to ptagenda_app;

alter table availability_rules enable row level security;
alter table availability_blocks enable row level security;
alter table bookings enable row level security;

create policy rules_pt on availability_rules to ptagenda_app
  using (pt_id = app_user_id()) with check (pt_id = app_user_id());
create policy blocks_pt on availability_blocks to ptagenda_app
  using (pt_id = app_user_id()) with check (pt_id = app_user_id());
create policy bookings_select on bookings for select to ptagenda_app
  using (pt_id = app_user_id() or student_id = app_user_id());
