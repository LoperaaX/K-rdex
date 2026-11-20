-- Kárdex · migración 2
-- Ejecutar en el SQL Editor de Supabase ANTES de usar "Borrar materia".
 
-- 1) RESTRICT -> NO ACTION en actividades -> clases.
--    NO ACTION se comprueba al final de la sentencia: sigue impidiendo borrar
--    una clase suelta con actividades vinculadas, pero permite el borrado en
--    cascada de una materia (o de un usuario).
--    Busca el nombre real del constraint, así que no depende del autogenerado.
do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.kx_actividades'::regclass
    and confrelid = 'public.kx_clases'::regclass
    and contype = 'f';
 
  if c is not null then
    execute format('alter table public.kx_actividades drop constraint %I', c);
  end if;
 
  alter table public.kx_actividades
    add constraint kx_actividades_clase_fk
    foreign key (user_id, materia_id, clase_id)
    references public.kx_clases (user_id, materia_id, id);
end $$;
 
-- 2) VERIFICACIÓN DE RLS (solo lectura). Ejecuta cada consulta y revisa:
--    - rls_activo debe ser true en entradas y en las tres kx_*.
--    - Cada tabla debe tener políticas solo para 'authenticated' con
--      user_id = auth.uid() en qual y with_check.
--    - La tercera consulta no debe listar anon ni PUBLIC sobre tus tablas.
 
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
 
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by 1, 2;
 
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'PUBLIC')
order by 1, 2, 3;