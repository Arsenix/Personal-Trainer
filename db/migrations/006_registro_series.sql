-- Iteración 7: registro de entrenamientos. El alumno anota lo que hizo en cada serie (repeticiones y peso).
-- Lo planificado por el PT no se toca: cada sesión guarda una copia de lo planificado y lo realizado,
-- así el historial sigue igual aunque el PT edite o reemplace la rutina después.

create table workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  student_id   text not null,
  pt_id        text not null,
  routine_id   uuid references routines(id) on delete set null,
  day_title    text not null check (length(trim(day_title)) between 1 and 60),
  performed_on date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (student_id, pt_id) references students (user_id, pt_id) on delete cascade,
  unique (student_id, day_title, performed_on)
);
create index workout_sessions_student_idx on workout_sessions (student_id, performed_on desc);
create index workout_sessions_pt_idx on workout_sessions (pt_id, performed_on desc);

create table workout_exercises (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references workout_sessions(id) on delete cascade,
  position          int  not null check (position between 1 and 20),
  name              text not null check (length(trim(name)) between 1 and 80),
  planned_sets      int  not null,
  planned_reps      text not null,
  planned_weight_kg numeric(5,2),
  note              text check (note is null or length(note) <= 200),
  unique (session_id, position)
);
create index workout_exercises_name_idx on workout_exercises (lower(name));

create table workout_sets (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references workout_exercises(id) on delete cascade,
  set_number  int  not null check (set_number between 1 and 20),
  reps        int  check (reps is null or reps between 0 and 999),
  weight_kg   numeric(5,2) check (weight_kg is null or (weight_kg >= 0 and weight_kg < 1000)),
  done        boolean not null default false,
  unique (exercise_id, set_number)
);

-- Guarda (o reemplaza) el entrenamiento de un día de la rutina activa del alumno.
-- p_data: [{"position": 1, "note": "", "sets": [{"reps": 10, "weight": 60, "done": true}]}]
-- Los nombres y lo planificado salen de la rutina, no de lo que mande el navegador.
-- Errores: not_student, routine_not_found, date_invalid, workout_invalid.
create function save_workout(p_day_id uuid, p_date date, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user  text := app_user_id();
  v_today date := (now() at time zone app_tz())::date;
  v_pt    text;
  v_rid   uuid;
  v_title text;
  v_sid   uuid;
  v_exid  uuid;
  v_ex    jsonb;
  v_set   jsonb;
  v_n     int;
  e       routine_exercises%rowtype;
begin
  select pt_id into v_pt from students where user_id = v_user;
  if not found then raise exception 'not_student'; end if;

  select d.routine_id, d.title into v_rid, v_title
    from routine_days d join routines r on r.id = d.routine_id
   where d.id = p_day_id and r.student_id = v_user and r.active;
  if not found then raise exception 'routine_not_found'; end if;

  if p_date is null or p_date > v_today or p_date < v_today - 6 then raise exception 'date_invalid'; end if;

  if p_data is null or jsonb_typeof(p_data) <> 'array' or jsonb_array_length(p_data) not between 1 and 20 then
    raise exception 'workout_invalid';
  end if;
  select count(distinct x->>'position') into v_n from jsonb_array_elements(p_data) x;
  if v_n <> jsonb_array_length(p_data) then raise exception 'workout_invalid'; end if;

  -- Valida todo antes de escribir.
  for v_ex in select * from jsonb_array_elements(p_data) loop
    if jsonb_typeof(v_ex) <> 'object'
       or coalesce(v_ex->>'position', '') !~ '^[0-9]{1,2}$'
       or not exists (select 1 from routine_exercises x where x.day_id = p_day_id and x.position = (v_ex->>'position')::int)
       or length(coalesce(v_ex->>'note', '')) > 200
       or coalesce(jsonb_typeof(v_ex->'sets'), '') <> 'array'
       or jsonb_array_length(v_ex->'sets') not between 1 and 20 then
      raise exception 'workout_invalid';
    end if;
    for v_set in select * from jsonb_array_elements(v_ex->'sets') loop
      if jsonb_typeof(v_set) <> 'object'
         or (coalesce(v_set->>'reps', '') <> '' and v_set->>'reps' !~ '^[0-9]{1,3}$')
         or (coalesce(v_set->>'weight', '') <> '' and v_set->>'weight' !~ '^[0-9]{1,3}([.][0-9]{1,2})?$')
         or coalesce(jsonb_typeof(v_set->'done'), '') <> 'boolean' then
        raise exception 'workout_invalid';
      end if;
    end loop;
  end loop;

  insert into workout_sessions (student_id, pt_id, routine_id, day_title, performed_on)
  values (v_user, v_pt, v_rid, v_title, p_date)
  on conflict (student_id, day_title, performed_on)
  do update set routine_id = excluded.routine_id, updated_at = now()
  returning id into v_sid;
  delete from workout_exercises where session_id = v_sid;

  for v_ex in select * from jsonb_array_elements(p_data) loop
    select * into e from routine_exercises where day_id = p_day_id and position = (v_ex->>'position')::int;
    insert into workout_exercises (session_id, position, name, planned_sets, planned_reps, planned_weight_kg, note)
    values (v_sid, e.position, e.name, e.sets, e.reps, e.weight_kg, nullif(trim(coalesce(v_ex->>'note', '')), ''))
    returning id into v_exid;
    v_n := 0;
    for v_set in select * from jsonb_array_elements(v_ex->'sets') loop
      v_n := v_n + 1;
      insert into workout_sets (exercise_id, set_number, reps, weight_kg, done)
      values (v_exid, v_n, nullif(v_set->>'reps', '')::int, nullif(v_set->>'weight', '')::numeric,
              (v_set->>'done')::boolean);
    end loop;
  end loop;
  return v_sid;
end $$;

revoke all on function save_workout(uuid, date, jsonb) from public;
grant execute on function save_workout(uuid, date, jsonb) to ptagenda_app;

grant select on workout_sessions, workout_exercises, workout_sets to ptagenda_app;
alter table workout_sessions enable row level security;
alter table workout_exercises enable row level security;
alter table workout_sets enable row level security;

create policy workout_sessions_select on workout_sessions for select to ptagenda_app
  using (student_id = app_user_id() or pt_id = app_user_id());
create policy workout_exercises_select on workout_exercises for select to ptagenda_app
  using (exists (select 1 from workout_sessions s where s.id = session_id));
create policy workout_sets_select on workout_sets for select to ptagenda_app
  using (exists (select 1 from workout_exercises e where e.id = exercise_id));
