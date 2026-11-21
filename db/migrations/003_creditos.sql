-- Iteración 3: planes por PT, mes activado por el PT, créditos y comprobantes de transferencia.
--
-- Reglas:
--  * 1 crédito = 1 clase. Los créditos son de un mes calendario: una clase usa los créditos del mes en que ocurre,
--    y lo que sobra al cambiar de mes se pierde (no hay arrastre, no hace falta ningún proceso de vencimiento).
--  * El alumno no elige plan: el PT lo carga al activar el mes. El precio y los créditos del plan se copian al mes.
--  * Sin mes activado (o sin créditos) no se puede reservar.
--  * Si el alumno cancela con 24 horas o más, el crédito vuelve. Si cancela el PT (o bloquea la agenda), siempre vuelve.
--    Con menos de 24 horas el alumno no puede cancelar: la clase cuenta como realizada y el crédito queda consumido.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table plans (
  id         uuid primary key default gen_random_uuid(),
  pt_id      text not null references pt_profiles(user_id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  credits    int  not null check (credits between 1 and 60),
  price_clp  int  not null check (price_clp between 0 and 100000000),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, pt_id)
);
create unique index plans_pt_name_idx on plans (pt_id, lower(name));

-- Un registro por alumno y mes calendario activado. `month` es siempre el día 1.
create table student_months (
  id           uuid primary key default gen_random_uuid(),
  pt_id        text not null references pt_profiles(user_id) on delete cascade,
  student_id   text not null references students(user_id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  plan_id      uuid,
  plan_name    text not null,
  price_clp    int  not null check (price_clp >= 0),
  credits      int  not null check (credits between 1 and 60),
  activated_at timestamptz not null default now(),
  unique (student_id, month),
  foreign key (plan_id, pt_id) references plans (id, pt_id) on delete no action
);
create index student_months_pt_idx on student_months (pt_id, month);

-- Libro de créditos: solo se agrega. El saldo de un mes es la suma de sus movimientos.
create table credit_ledger (
  id         bigint generated always as identity primary key,
  student_id text not null references students(user_id) on delete cascade,
  pt_id      text not null references pt_profiles(user_id) on delete cascade,
  month      date not null,
  delta      int  not null check (delta <> 0),
  reason     text not null check (reason in ('activation', 'adjustment', 'booking', 'refund')),
  booking_id uuid references bookings(id) on delete set null,
  note       text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);
create index credit_ledger_student_idx on credit_ledger (student_id, month);
-- Una clase gasta un crédito una vez y se devuelve una vez como máximo.
create unique index credit_ledger_booking_once on credit_ledger (booking_id, reason)
  where reason in ('booking', 'refund');

create table payment_proofs (
  id         uuid primary key default gen_random_uuid(),
  student_id text not null references students(user_id) on delete cascade,
  pt_id      text not null references pt_profiles(user_id) on delete cascade,
  month      date not null check (month = date_trunc('month', month)::date),
  file_name  text not null check (length(file_name) between 1 and 120),
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes int  not null check (size_bytes between 1 and 5242880),
  data       bytea not null check (octet_length(data) = size_bytes),
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  note       text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index payment_proofs_student_idx on payment_proofs (student_id, month);
create index payment_proofs_pt_idx on payment_proofs (pt_id, status, created_at desc);

alter table bookings add column credit_month date;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------
create function current_month() returns date language sql stable as
$$ select date_trunc('month', now() at time zone app_tz())::date $$;

create function month_balance(p_student text, p_month date) returns int
language sql stable security definer set search_path = public, pg_temp as
$$ select coalesce(sum(delta), 0)::int from credit_ledger where student_id = p_student and month = p_month $$;

-- Devuelve el crédito de una clase cancelada (si la clase había gastado uno).
create function refund_credit(p_booking uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking;
  if not found or b.credit_month is null then return; end if;
  insert into credit_ledger (student_id, pt_id, month, delta, reason, booking_id)
  values (b.student_id, b.pt_id, b.credit_month, 1, 'refund', b.id)
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Planes del PT
-- ---------------------------------------------------------------------------
create function save_plan(p_id uuid, p_name text, p_credits int, p_price int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  v_id   uuid := p_id;
begin
  if not exists (select 1 from pt_profiles where user_id = v_user) then raise exception 'not_pt'; end if;
  begin
    if p_id is null then
      insert into plans (pt_id, name, credits, price_clp, active)
      values (v_user, trim(p_name), p_credits, p_price, coalesce(p_active, true))
      returning id into v_id;
      perform log_audit(v_user, 'plan.created', 'plan', v_id::text,
                        jsonb_build_object('name', trim(p_name), 'credits', p_credits, 'price', p_price));
    else
      update plans set name = trim(p_name), credits = p_credits, price_clp = p_price, active = coalesce(p_active, active)
       where id = p_id and pt_id = v_user;
      if not found then raise exception 'plan_not_found'; end if;
      perform log_audit(v_user, 'plan.updated', 'plan', p_id::text,
                        jsonb_build_object('name', trim(p_name), 'credits', p_credits, 'price', p_price, 'active', p_active));
    end if;
  exception when unique_violation then
    raise exception 'plan_name_taken';
  end;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Activar un mes para un alumno (lo hace el PT al confirmar el pago)
-- Errores: not_pt, student_not_found, month_invalid, plan_not_found, already_active.
-- ---------------------------------------------------------------------------
create function activate_month(p_student text, p_month date, p_plan uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  v_cur  date := current_month();
  p      plans%rowtype;
  v_id   uuid;
begin
  if not exists (select 1 from pt_profiles where user_id = v_user) then raise exception 'not_pt'; end if;
  if not exists (select 1 from students where user_id = p_student and pt_id = v_user) then
    raise exception 'student_not_found';
  end if;
  -- Solo el mes en curso o el siguiente.
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month < v_cur or p_month > (v_cur + interval '1 month')::date then
    raise exception 'month_invalid';
  end if;
  select * into p from plans where id = p_plan and pt_id = v_user and active;
  if not found then raise exception 'plan_not_found'; end if;

  begin
    insert into student_months (pt_id, student_id, month, plan_id, plan_name, price_clp, credits)
    values (v_user, p_student, p_month, p.id, p.name, p.price_clp, p.credits)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_active';
  end;

  insert into credit_ledger (student_id, pt_id, month, delta, reason, note)
  values (p_student, v_user, p_month, p.credits, 'activation', p.name);

  update payment_proofs set status = 'accepted', decided_at = now()
   where student_id = p_student and month = p_month and status = 'pending';

  perform log_audit(v_user, 'month.activated', 'student_month', v_id::text,
                    jsonb_build_object('student', p_student, 'month', p_month, 'plan', p.name,
                                       'credits', p.credits, 'price', p.price_clp));
  return v_id;
end $$;

-- Ajuste manual de créditos de un mes ya activado (suma o resta, con motivo).
-- Errores: not_pt, student_not_found, month_not_active, adjust_invalid, balance_negative.
create function adjust_credits(p_student text, p_month date, p_delta int, p_note text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  v_bal  int;
begin
  if not exists (select 1 from pt_profiles where user_id = v_user) then raise exception 'not_pt'; end if;
  if not exists (select 1 from students where user_id = p_student and pt_id = v_user) then
    raise exception 'student_not_found';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 60 or length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'adjust_invalid';
  end if;
  -- Bloquea el mes para no cruzarse con una reserva en curso.
  perform 1 from student_months where student_id = p_student and month = p_month for update;
  if not found then raise exception 'month_not_active'; end if;
  v_bal := month_balance(p_student, p_month);
  if v_bal + p_delta < 0 then raise exception 'balance_negative'; end if;

  insert into credit_ledger (student_id, pt_id, month, delta, reason, note)
  values (p_student, v_user, p_month, p_delta, 'adjustment', left(trim(p_note), 200));
  perform log_audit(v_user, 'credits.adjusted', 'student_month', null,
                    jsonb_build_object('student', p_student, 'month', p_month, 'delta', p_delta));
  return v_bal + p_delta;
end $$;

-- ---------------------------------------------------------------------------
-- Comprobantes de transferencia
-- ---------------------------------------------------------------------------
-- Errores: not_student, month_invalid, too_many_proofs, proof_invalid.
create function upload_proof(p_month date, p_name text, p_mime text, p_data bytea) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  v_pt   text;
  v_cur  date := current_month();
  v_id   uuid;
begin
  select pt_id into v_pt from students where user_id = v_user;
  if v_user is null or v_pt is null then raise exception 'not_student'; end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month < v_cur or p_month > (v_cur + interval '1 month')::date then
    raise exception 'month_invalid';
  end if;
  if p_data is null or octet_length(p_data) = 0 or octet_length(p_data) > 5242880
     or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     or length(coalesce(p_name, '')) not between 1 and 120 then
    raise exception 'proof_invalid';
  end if;
  if (select count(*) from payment_proofs
       where student_id = v_user and month = p_month and status = 'pending') >= 5 then
    raise exception 'too_many_proofs';
  end if;

  insert into payment_proofs (student_id, pt_id, month, file_name, mime, size_bytes, data)
  values (v_user, v_pt, p_month, p_name, p_mime, octet_length(p_data), p_data)
  returning id into v_id;
  perform log_audit(v_user, 'proof.uploaded', 'payment_proof', v_id::text,
                    jsonb_build_object('month', p_month, 'mime', p_mime, 'size', octet_length(p_data)));
  return v_id;
end $$;

-- El PT rechaza un comprobante pendiente (con una nota para el alumno).
create function reject_proof(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
begin
  update payment_proofs
     set status = 'rejected', decided_at = now(), note = left(nullif(trim(p_note), ''), 200)
   where id = p_id and pt_id = v_user and status = 'pending';
  if not found then raise exception 'proof_not_found'; end if;
  perform log_audit(v_user, 'proof.rejected', 'payment_proof', p_id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Reservas y cancelaciones con créditos
-- ---------------------------------------------------------------------------
drop function book_class(timestamptz);
create function book_class(p_start timestamptz) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user  text := app_user_id();
  v_pt    text;
  v_loc   uuid;
  v_local timestamp;
  v_date  date;
  v_hour  int;
  v_month date;
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

  -- Mes de la clase: tiene que estar activado y con créditos. El bloqueo de la fila serializa las
  -- reservas simultáneas del mismo alumno para que nunca se gaste un crédito que no existe.
  v_month := date_trunc('month', v_local)::date;
  perform 1 from student_months where student_id = v_user and month = v_month for update;
  if not found then raise exception 'month_not_active'; end if;
  if month_balance(v_user, v_month) < 1 then raise exception 'no_credits'; end if;

  begin
    insert into bookings (pt_id, student_id, location_id, start_at, end_at, credit_month)
    values (v_pt, v_user, v_loc, p_start, p_start + interval '1 hour', v_month)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  insert into credit_ledger (student_id, pt_id, month, delta, reason, booking_id)
  values (v_user, v_pt, v_month, -1, 'booking', v_id);

  perform log_audit(v_user, 'booking.created', 'booking', v_id::text, jsonb_build_object('start_at', p_start));
  return v_id;
end $$;

create or replace function cancel_booking(p_id uuid, p_reason text default null) returns text
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
    perform refund_credit(b.id);
    perform log_audit(v_user, 'booking.cancelled_by_student', 'booking', b.id::text,
                      jsonb_build_object('start_at', b.start_at));
    return 'cancelled_student';
  elsif v_role = 'pt' and b.pt_id = v_user then
    if b.status <> 'booked' then raise exception 'booking_not_active'; end if;
    if b.start_at <= now() then raise exception 'booking_past'; end if;
    update bookings
       set status = 'cancelled_pt', cancelled_at = now(), cancel_reason = left(nullif(trim(p_reason), ''), 200)
     where id = b.id;
    perform refund_credit(b.id);
    perform log_audit(v_user, 'booking.cancelled_by_pt', 'booking', b.id::text,
                      jsonb_build_object('start_at', b.start_at));
    return 'cancelled_pt';
  end if;
  raise exception 'booking_not_found';
end $$;

-- block_range: igual que antes, pero devolviendo el crédito de cada clase cancelada.
create or replace function block_range(p_date date, p_start int, p_end int, p_reason text default null)
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
  ), refunds as (
    insert into credit_ledger (student_id, pt_id, month, delta, reason, booking_id)
    select b.student_id, b.pt_id, b.credit_month, 1, 'refund', b.id
      from bookings b join cancelled c on c.id = b.id
     where b.credit_month is not null
    on conflict do nothing
    returning 1
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
revoke all on function current_month() from public;
revoke all on function month_balance(text, date) from public;
revoke all on function refund_credit(uuid) from public;
revoke all on function save_plan(uuid, text, int, int, boolean) from public;
revoke all on function activate_month(text, date, uuid) from public;
revoke all on function adjust_credits(text, date, int, text) from public;
revoke all on function upload_proof(date, text, text, bytea) from public;
revoke all on function reject_proof(uuid, text) from public;
revoke all on function book_class(timestamptz) from public;
grant execute on function current_month() to ptagenda_app;
grant execute on function save_plan(uuid, text, int, int, boolean) to ptagenda_app;
grant execute on function activate_month(text, date, uuid) to ptagenda_app;
grant execute on function adjust_credits(text, date, int, text) to ptagenda_app;
grant execute on function upload_proof(date, text, text, bytea) to ptagenda_app;
grant execute on function reject_proof(uuid, text) to ptagenda_app;
grant execute on function book_class(timestamptz) to ptagenda_app;
grant execute on function cancel_booking(uuid, text) to ptagenda_app;
grant execute on function block_range(date, int, int, text) to ptagenda_app;

grant select on plans, student_months, credit_ledger, payment_proofs to ptagenda_app;

alter table plans enable row level security;
alter table student_months enable row level security;
alter table credit_ledger enable row level security;
alter table payment_proofs enable row level security;

create policy plans_pt on plans for select to ptagenda_app using (pt_id = app_user_id());
create policy months_select on student_months for select to ptagenda_app
  using (pt_id = app_user_id() or student_id = app_user_id());
create policy ledger_select on credit_ledger for select to ptagenda_app
  using (pt_id = app_user_id() or student_id = app_user_id());
create policy proofs_select on payment_proofs for select to ptagenda_app
  using (pt_id = app_user_id() or student_id = app_user_id());
