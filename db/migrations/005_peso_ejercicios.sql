-- Iteración 6: peso por ejercicio en las rutinas.
-- weight_kg es opcional: vacío significa peso corporal o sin carga. Hasta 999,99 kg con dos decimales.
-- save_routine y copy_routine se reemplazan (misma firma, así que los permisos se conservan).

alter table routine_exercises
  add column weight_kg numeric(5,2) check (weight_kg is null or (weight_kg >= 0 and weight_kg < 1000));

create or replace function save_routine(p_id uuid, p_student text, p_name text, p_notes text, p_days jsonb) returns uuid
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
         or (v_ex->>'sets')::int not between 1 and 20
         or (coalesce(v_ex->>'weight', '') <> '' and v_ex->>'weight' !~ '^[0-9]{1,3}([.][0-9]{1,2})?$') then
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
      insert into routine_exercises (routine_id, day_id, position, name, sets, reps, weight_kg, note)
      values (v_id, v_day_id, v_ei, trim(v_ex->>'name'), (v_ex->>'sets')::int, trim(v_ex->>'reps'),
              nullif(v_ex->>'weight', '')::numeric,
              nullif(trim(coalesce(v_ex->>'note', '')), ''));
    end loop;
  end loop;
  return v_id;
end $$;

create or replace function copy_routine(p_id uuid, p_student text) returns uuid
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
           'exercises', (select jsonb_agg(jsonb_build_object('name', e.name, 'sets', e.sets, 'reps', e.reps, 'weight', e.weight_kg, 'note', e.note)
                                          order by e.position)
                           from routine_exercises e where e.day_id = d.id)) order by d.position)
    into v_days from routine_days d where d.routine_id = r.id;
  return save_routine(null, p_student, r.name, r.notes, v_days);
end $$;
