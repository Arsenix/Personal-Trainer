-- Iteración 4: rutinas. El PT arma una rutina estructurada (días con ejercicios) para cada alumno.
-- Un alumno tiene como máximo una rutina activa; las anteriores quedan archivadas. El alumno solo ve la activa.

alter table students add constraint students_user_pt_key unique (user_id, pt_id);

create table routines (
  id         uuid primary key default gen_random_uuid(),
  pt_id      text not null references pt_profiles(user_id) on delete cascade,
  student_id text not null,
  name       text not null check (length(trim(name)) between 1 and 80),
  notes      text check (notes is null or length(notes) <= 500),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, pt_id) references students (user_id, pt_id) on delete cascade
);
create unique index routines_one_active_idx on routines (student_id) where active;
create index routines_pt_idx on routines (pt_id, active);

create table routine_days (
  id         uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines(id) on delete cascade,
  position   int  not null check (position between 1 and 7),
  title      text not null check (length(trim(title)) between 1 and 60),
  unique (routine_id, position)
);

create table routine_exercises (
  id         uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines(id) on delete cascade,
  day_id     uuid not null references routine_days(id) on delete cascade,
  position   int  not null check (position between 1 and 20),
  name       text not null check (length(trim(name)) between 1 and 80),
  sets       int  not null check (sets between 1 and 20),
  reps       text not null check (length(trim(reps)) between 1 and 20),
  note       text check (note is null or length(note) <= 200),
  unique (day_id, position)
);
create index routine_exercises_routine_idx on routine_exercises (routine_id);

-- Crea o reemplaza una rutina completa en una sola operación.
-- p_days: [{"title": "Día A", "exercises": [{"name": "Sentadilla", "sets": 4, "reps": "8-10", "note": ""}]}]
-- Errores: not_pt, student_not_found, routine_not_found, routine_invalid.
create function save_routine(p_id uuid, p_student text, p_name text, p_notes text, p_days jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  v_id   uuid := p_id;
  v_stu  text := p_student;
  v_day  jsonb;
  v_ex   jsonb;
  v_day_id uuid;
  v_di   int := 0;
  v_ei   int;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if not exists (select 1 from pt_profiles where user_id = v_user) then raise exception 'not_pt'; end if;

  if p_id is not null then
    select student_id into v_stu from routines where id = p_id and pt_id = v_user for update;
    if not found then raise exception 'routine_not_found'; end if;
  elsif not exists (select 1 from students where user_id = p_student and pt_id = v_user) then
    raise exception 'student_not_found';
  end if;

  if length(trim(coalesce(p_name, ''))) not between 1 and 80
     or (v_notes is not null and length(v_notes) > 500)
     or p_days is null or jsonb_typeof(p_days) <> 'array'
     or jsonb_array_length(p_days) not between 1 and 7 then
    raise exception 'routine_invalid';
  end if;
  -- Valida todo antes de escribir.
  for v_day in select * from jsonb_array_elements(p_days) loop
    if jsonb_typeof(v_day) <> 'object' or jsonb_typeof(v_day->'exercises') <> 'array'
       or length(trim(coalesce(v_day->>'title', ''))) not between 1 and 60
       or jsonb_array_length(v_day->'exercises') not between 1 and 20 then
      raise exception 'routine_invalid';
    end if;
    for v_ex in select * from jsonb_array_elements(v_day->'exercises') loop
      if jsonb_typeof(v_ex) <> 'object'
         or length(trim(coalesce(v_ex->>'name', ''))) not between 1 and 80
         or length(trim(coalesce(v_ex->>'reps', ''))) not between 1 and 20
         or length(coalesce(v_ex->>'note', '')) > 200
         or coalesce(v_ex->>'sets', '') !~ '^[0-9]{1,2}$'
         or (v_ex->>'sets')::int not between 1 and 20 then
        raise exception 'routine_invalid';
      end if;
    end loop;
  end loop;

  if p_id is null then
    update routines set active = false, updated_at = now() where student_id = v_stu and active;
    insert into routines (pt_id, student_id, name, notes)
    values (v_user, v_stu, trim(p_name), v_notes) returning id into v_id;
    perform log_audit(v_user, 'routine.created', 'routine', v_id::text,
                      jsonb_build_object('student', v_stu, 'name', trim(p_name)));
  else
    update routines set name = trim(p_name), notes = v_notes, updated_at = now() where id = p_id;
    delete from routine_days where routine_id = p_id;
    perform log_audit(v_user, 'routine.updated', 'routine', p_id::text, jsonb_build_object('student', v_stu));
  end if;

  for v_day in select * from jsonb_array_elements(p_days) loop
    v_di := v_di + 1;
    insert into routine_days (routine_id, position, title)
    values (v_id, v_di, trim(v_day->>'title')) returning id into v_day_id;
    v_ei := 0;
    for v_ex in select * from jsonb_array_elements(v_day->'exercises') loop
      v_ei := v_ei + 1;
      insert into routine_exercises (routine_id, day_id, position, name, sets, reps, note)
      values (v_id, v_day_id, v_ei, trim(v_ex->>'name'), (v_ex->>'sets')::int, trim(v_ex->>'reps'),
              nullif(trim(coalesce(v_ex->>'note', '')), ''));
    end loop;
  end loop;
  return v_id;
end $$;

-- Archiva o reactiva una rutina. Reactivar archiva la que estaba activa.
create function set_routine_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  v_stu  text;
begin
  select student_id into v_stu from routines where id = p_id and pt_id = v_user for update;
  if not found then raise exception 'routine_not_found'; end if;
  if p_active then
    update routines set active = false, updated_at = now() where student_id = v_stu and active and id <> p_id;
  end if;
  update routines set active = p_active, updated_at = now() where id = p_id;
  perform log_audit(v_user, case when p_active then 'routine.restored' else 'routine.archived' end,
                    'routine', p_id::text, jsonb_build_object('student', v_stu));
end $$;

-- Copia una rutina a otro alumno del mismo PT (queda como su rutina activa).
create function copy_routine(p_id uuid, p_student text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user text := app_user_id();
  r      routines%rowtype;
  v_days jsonb;
begin
  select * into r from routines where id = p_id and pt_id = v_user;
  if not found then raise exception 'routine_not_found'; end if;
  select jsonb_agg(jsonb_build_object(
           'title', d.title,
           'exercises', (select jsonb_agg(jsonb_build_object('name', e.name, 'sets', e.sets, 'reps', e.reps, 'note', e.note)
                                          order by e.position)
                           from routine_exercises e where e.day_id = d.id)) order by d.position)
    into v_days from routine_days d where d.routine_id = r.id;
  return save_routine(null, p_student, r.name, r.notes, v_days);
end $$;

revoke all on function save_routine(uuid, text, text, text, jsonb) from public;
revoke all on function set_routine_active(uuid, boolean) from public;
revoke all on function copy_routine(uuid, text) from public;
grant execute on function save_routine(uuid, text, text, text, jsonb) to ptagenda_app;
grant execute on function set_routine_active(uuid, boolean) to ptagenda_app;
grant execute on function copy_routine(uuid, text) to ptagenda_app;

grant select on routines, routine_days, routine_exercises to ptagenda_app;
alter table routines enable row level security;
alter table routine_days enable row level security;
alter table routine_exercises enable row level security;

create policy routines_select on routines for select to ptagenda_app
  using (pt_id = app_user_id() or (student_id = app_user_id() and active));
create policy routine_days_select on routine_days for select to ptagenda_app
  using (exists (select 1 from routines r where r.id = routine_id));
create policy routine_exercises_select on routine_exercises for select to ptagenda_app
  using (exists (select 1 from routines r where r.id = routine_id));
