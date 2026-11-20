-- Iteración 1: identidad, PT, alumnos, lugares, invitaciones y auditoría.
--
-- Dos roles de base de datos (se crean en scripts/migrate.ts, con su clave desde el entorno):
--   ptagenda_auth: lo usa solo Better Auth (tablas user/session/account/verification).
--   ptagenda_app : lo usa la aplicación. NO es dueño de las tablas, así que Row Level Security aplica.
--
-- La aplicación le dice a Postgres quién es el usuario con set_config('app.user_id', ..., true)
-- dentro de cada transacción (ver src/lib/db.ts).

-- ---------------------------------------------------------------------------
-- Tablas de Better Auth (nombres de columna por defecto de la librería)
-- ---------------------------------------------------------------------------
create table "user" (
  id              text primary key,
  name            text not null,
  email           text not null,
  "emailVerified" boolean not null default false,
  image           text,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now(),
  role            text not null check (role in ('pt', 'student'))
);
create unique index user_email_lower_key on "user" (lower(email));

create table session (
  id          text primary key,
  "expiresAt" timestamptz not null,
  token       text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId"    text not null references "user"(id) on delete cascade
);
create index session_user_idx on session ("userId");

create table account (
  id                      text primary key,
  "accountId"             text not null,
  "providerId"            text not null,
  "userId"                text not null references "user"(id) on delete cascade,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope                   text,
  password                text,
  "createdAt"             timestamptz not null default now(),
  "updatedAt"             timestamptz not null default now()
);
create index account_user_idx on account ("userId");

create table verification (
  id          text primary key,
  identifier  text not null,
  value       text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tablas de la aplicación
-- ---------------------------------------------------------------------------
create table pt_profiles (
  user_id         text primary key references "user"(id) on delete cascade,
  display_name    text not null check (length(display_name) between 2 and 80),
  phone           text,
  -- Datos para que sus alumnos le transfieran (se muestran solo a sus alumnos).
  transfer_holder text,
  transfer_rut    text,
  transfer_bank   text,
  transfer_type   text check (transfer_type in ('corriente', 'vista', 'ahorro', 'rut')),
  transfer_number text,
  transfer_email  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table locations (
  id          uuid primary key default gen_random_uuid(),
  pt_id       text not null references pt_profiles(user_id) on delete cascade,
  name        text not null check (length(name) between 2 and 80),
  kind        text not null check (kind in ('gym', 'home', 'other')),
  address     text check (address is null or length(address) <= 200),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (id, pt_id)
);
create unique index locations_pt_name_key on locations (pt_id, lower(name)) where archived_at is null;

create table students (
  user_id     text primary key references "user"(id) on delete cascade,
  pt_id       text not null references pt_profiles(user_id) on delete cascade,
  location_id uuid,
  phone       text,
  created_at  timestamptz not null default now(),
  -- El lugar de un alumno siempre pertenece a su propio PT.
  foreign key (location_id, pt_id) references locations (id, pt_id)
);
create index students_pt_idx on students (pt_id);

create table invitations (
  id               uuid primary key default gen_random_uuid(),
  pt_id            text not null references pt_profiles(user_id) on delete cascade,
  email            text not null,
  name             text not null check (length(name) between 2 and 80),
  phone            text,
  location_id      uuid,
  token_hash       text not null unique,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  accepted_user_id text references "user"(id) on delete set null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (location_id, pt_id) references locations (id, pt_id)
);
create unique index invitations_pending_key
  on invitations (pt_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Registro de auditoría: solo se agrega, nunca se modifica ni se borra.
create table audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor_id  text,
  actor_role text,
  pt_id     text,
  action    text not null,
  entity    text,
  entity_id text,
  meta      jsonb not null default '{}'::jsonb
);
create index audit_pt_at_idx on audit_log (pt_id, at desc);

create function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log es de solo lectura (append-only)';
end $$;

create trigger audit_log_no_update_delete
  before update or delete on audit_log
  for each row execute function audit_log_immutable();
create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------
create function app_user_id() returns text language sql stable as
$$ select nullif(current_setting('app.user_id', true), '') $$;

-- Única vía para escribir en audit_log. Deriva el rol y el PT dueño desde las tablas.
create function log_audit(
  p_actor text, p_action text, p_entity text, p_entity_id text, p_meta jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role text;
  v_pt   text;
begin
  select role into v_role from "user" where id = p_actor;
  if v_role = 'pt' then
    v_pt := p_actor;
  elsif v_role = 'student' then
    select pt_id into v_pt from students where user_id = p_actor;
  end if;
  insert into audit_log (actor_id, actor_role, pt_id, action, entity, entity_id, meta)
  values (p_actor, v_role, v_pt, p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
end $$;

-- Alta de PT: usuario + credencial + perfil en una sola transacción.
create function register_pt(
  p_user_id text, p_email text, p_name text, p_password_hash text, p_phone text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into "user" (id, name, email, role) values (p_user_id, p_name, lower(p_email), 'pt');
  insert into account (id, "accountId", "providerId", "userId", password)
  values (gen_random_uuid()::text, p_user_id, 'credential', p_user_id, p_password_hash);
  insert into pt_profiles (user_id, display_name, phone) values (p_user_id, p_name, p_phone);
  perform log_audit(p_user_id, 'pt.registered', 'user', p_user_id);
end $$;

-- Vista previa de una invitación para la pantalla donde el alumno crea su clave.
create function invitation_preview(p_token_hash text)
returns table (invitee_name text, email text, pt_name text, state text)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.name, i.email, p.display_name,
    case
      when i.accepted_at is not null then 'used'
      when i.revoked_at  is not null then 'revoked'
      when i.expires_at <= now()     then 'expired'
      else 'valid'
    end
  from invitations i join pt_profiles p on p.user_id = i.pt_id
  where i.token_hash = p_token_hash
$$;

-- Aceptar una invitación: crea usuario, credencial y alumno de forma atómica.
-- Errores con mensaje fijo: invitation_invalid, email_taken.
create function accept_invitation(p_token_hash text, p_user_id text, p_password_hash text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  inv invitations%rowtype;
begin
  select * into inv from invitations where token_hash = p_token_hash for update;
  if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at <= now() then
    raise exception 'invitation_invalid';
  end if;
  if exists (select 1 from "user" where lower(email) = lower(inv.email)) then
    raise exception 'email_taken';
  end if;

  insert into "user" (id, name, email, role) values (p_user_id, inv.name, lower(inv.email), 'student');
  insert into account (id, "accountId", "providerId", "userId", password)
  values (gen_random_uuid()::text, p_user_id, 'credential', p_user_id, p_password_hash);
  insert into students (user_id, pt_id, location_id, phone)
  values (p_user_id, inv.pt_id, inv.location_id, inv.phone);
  update invitations set accepted_at = now(), accepted_user_id = p_user_id where id = inv.id;
  perform log_audit(p_user_id, 'student.joined', 'invitation', inv.id::text,
                    jsonb_build_object('pt_id', inv.pt_id));
end $$;

-- ¿Ya existe una cuenta con este correo? (para no invitar dos veces a la misma persona)
create function email_in_use(p_email text) returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select exists (select 1 from "user" where lower(email) = lower(p_email)) $$;

-- ---------------------------------------------------------------------------
-- Roles y permisos
-- ---------------------------------------------------------------------------
revoke all on function log_audit(text, text, text, text, jsonb) from public;
revoke all on function register_pt(text, text, text, text, text) from public;
revoke all on function invitation_preview(text) from public;
revoke all on function accept_invitation(text, text, text) from public;
revoke all on function email_in_use(text) from public;

grant execute on function log_audit(text, text, text, text, jsonb) to ptagenda_app;
grant execute on function register_pt(text, text, text, text, text) to ptagenda_app;
grant execute on function invitation_preview(text) to ptagenda_app;
grant execute on function accept_invitation(text, text, text) to ptagenda_app;
grant execute on function email_in_use(text) to ptagenda_app;
grant execute on function app_user_id() to ptagenda_app, ptagenda_auth;

-- Better Auth: solo sus tablas. No puede cambiar el rol de un usuario.
grant select on "user" to ptagenda_auth;
grant update (name, image, "emailVerified", "updatedAt") on "user" to ptagenda_auth;
grant select, insert, update, delete on session to ptagenda_auth;
grant select, update on account to ptagenda_auth;
grant select, insert, update, delete on verification to ptagenda_auth;

-- Aplicación: lee "user" solo según RLS; el resto según las políticas de abajo.
grant select on "user" to ptagenda_app;
grant select, update on pt_profiles to ptagenda_app;
grant select, insert, update on locations to ptagenda_app;
grant select, update (location_id, phone) on students to ptagenda_app;
grant select, insert, update on invitations to ptagenda_app;
grant select on audit_log to ptagenda_app;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table "user" enable row level security;
alter table pt_profiles enable row level security;
alter table locations enable row level security;
alter table students enable row level security;
alter table invitations enable row level security;
alter table audit_log enable row level security;

-- Better Auth ve todas las filas de sus tablas de usuario.
create policy auth_all on "user" to ptagenda_auth using (true) with check (true);

-- "user": cada uno se ve a sí mismo; el PT ve a sus alumnos; el alumno ve a su PT.
create policy user_self on "user" to ptagenda_app
  using (id = app_user_id());
create policy user_pt_sees_students on "user" to ptagenda_app
  using (exists (select 1 from students s where s.user_id = "user".id and s.pt_id = app_user_id()));
create policy user_student_sees_pt on "user" to ptagenda_app
  using (exists (select 1 from students s where s.user_id = app_user_id() and s.pt_id = "user".id));

-- pt_profiles: el PT ve y edita el suyo; sus alumnos lo ven (para los datos de transferencia).
create policy pt_profiles_select on pt_profiles for select to ptagenda_app
  using (user_id = app_user_id()
         or exists (select 1 from students s where s.user_id = app_user_id() and s.pt_id = pt_profiles.user_id));
create policy pt_profiles_update on pt_profiles for update to ptagenda_app
  using (user_id = app_user_id()) with check (user_id = app_user_id());

-- locations: el PT gestiona los suyos; el alumno ve solo el que tiene asignado.
create policy locations_select on locations for select to ptagenda_app
  using (pt_id = app_user_id()
         or exists (select 1 from students s where s.user_id = app_user_id() and s.location_id = locations.id));
create policy locations_insert on locations for insert to ptagenda_app
  with check (pt_id = app_user_id());
create policy locations_update on locations for update to ptagenda_app
  using (pt_id = app_user_id()) with check (pt_id = app_user_id());

-- students: el PT ve y edita a los suyos; el alumno se ve a sí mismo (solo lectura).
create policy students_select on students for select to ptagenda_app
  using (pt_id = app_user_id() or user_id = app_user_id());
create policy students_update on students for update to ptagenda_app
  using (pt_id = app_user_id()) with check (pt_id = app_user_id());

-- invitations: solo el PT que las creó.
create policy invitations_select on invitations for select to ptagenda_app
  using (pt_id = app_user_id());
create policy invitations_insert on invitations for insert to ptagenda_app
  with check (pt_id = app_user_id());
create policy invitations_update on invitations for update to ptagenda_app
  using (pt_id = app_user_id()) with check (pt_id = app_user_id());

-- audit_log: el PT lee los eventos de su propio ámbito (suyos y de sus alumnos).
create policy audit_select on audit_log for select to ptagenda_app
  using (pt_id = app_user_id());
