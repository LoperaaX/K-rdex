# Conocimiento

Base de conocimiento personal para soporte: plantillas con campos rellenables,
procesos paso a paso y aprendizajes, organizados por aplicación.
Un solo archivo `index.html` + Supabase (login y base de datos).

## Puesta en marcha (≈10 min)

1. Crea un proyecto en https://supabase.com
2. **SQL Editor > New query**: pega `schema.sql` y pulsa **Run**.
   Al final debe aparecer 1 fila: `solo lo propio | ALL`.
3. **Authentication > Sign In / Providers > User Signups**: desactiva
   "Allow new users to sign up" y guarda.
4. **Authentication > Users > Add user > Create new user**: correo, contraseña
   y marca "Auto Confirm User". Repite para cada persona (cada una ve solo lo suyo).
5. **Project Settings > API Keys**: copia la Project URL y la clave `anon`/publishable
   en `index.html` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
   ⚠️ Nunca uses la clave `service_role` o `secret`.
6. Prueba local (no lo abras con doble clic):
   `npx serve .`  o  `python -m http.server 8000`
7. Publica: arrastra la carpeta a https://app.netlify.com/drop
8. **Authentication > URL Configuration**: pon el link publicado como Site URL.

## Uso

| Sección | Qué hace |
|---|---|
| Plantillas | Escribe `{{usuario}}`, `{{ticket}}`, etc. Al abrirla aparecen campos para rellenar y una vista previa en vivo. «Copiar texto» copia el resultado final. |
| Procesos | Un paso por línea. Se muestran como checklist con progreso. |
| Aprendizaje | Notas libres; una línea en blanco separa párrafos y los enlaces son clicables. |
| Fijadas | Entradas marcadas con el pin; siempre aparecen primero. |

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `Ctrl K` / `⌘ K` | Buscar en todo (también acciones) |
| `N` | Nueva entrada |
| `/` | Filtrar la lista |
| `J` / `K` o flechas | Moverse entre entradas |
| `C` | Copiar la entrada abierta |
| `E` | Editar |
| `P` | Fijar / desfijar |
| `Ctrl Enter` | Guardar en el editor |
| `Esc` | Cerrar |

## Copia de seguridad
Botón de descarga (abajo a la izquierda) o `Ctrl K` → "Exportar copia (JSON)".
