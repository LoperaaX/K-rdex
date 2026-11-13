-- =========================================================
-- Conocimiento · esquema de base de datos
-- Supabase > SQL Editor > New query > pegar > Run
-- Se puede ejecutar varias veces sin romper nada.
-- =========================================================

create table if not exists public.entradas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('plantilla','proceso','nota')),
  aplicacion  text not null check (char_length(aplicacion) between 1 and 80),
  categoria   text check (categoria is null or char_length(categoria) <= 80),
  titulo      text not null check (char_length(titulo) between 1 and 200),
  contenido   text not null default '' check (char_length(contenido) <= 50000),
  fijado      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Si ya tenías la tabla de la versión anterior, esto añade la columna nueva
alter table public.entradas add column if not exists fijado boolean not null default false;

create index if not exists entradas_user_idx on public.entradas (user_id, updated_at desc);

-- Seguridad por filas: cada usuario solo ve y modifica lo suyo
alter table public.entradas enable row level security;

drop policy if exists "solo lo propio" on public.entradas;
create policy "solo lo propio" on public.entradas
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- updated_at lo pone el servidor, y solo cuando cambia el contenido (fijar no cuenta)
create or replace function public.entradas_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.tipo, new.aplicacion, new.categoria, new.titulo, new.contenido)
     is distinct from (old.tipo, old.aplicacion, old.categoria, old.titulo, old.contenido) then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists entradas_touch on public.entradas;
create trigger entradas_touch before update on public.entradas
  for each row execute function public.entradas_touch();

-- Verificación: debe devolver 1 fila (solo lo propio | ALL)
select policyname, cmd from pg_policies where tablename = 'entradas';