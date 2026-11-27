# Kárdex

Aplicación web con tres espacios: Soporte para plantillas, procesos y notas,
Universidad para materias, clases y entregas, y Personal para notas, compras
y mantenimiento de la moto. Supabase gestiona el acceso y los datos.

## Desarrollo local

1. Desde la raíz del repositorio, ejecuta `npx serve .` o `python -m http.server 8000`.
2. Abre la dirección que imprime el servidor e inicia sesión con una cuenta del proyecto de Supabase configurado en `app.js`.

`schema.sql` contiene la migración para el borrado en cascada de materias y las consultas de verificación de permisos. La migración requiere las tablas existentes de Kárdex.

La rama `main` se despliega en [Vercel](https://mikardex.vercel.app/).

## Uso

La interfaz se sirve como archivos estáticos. Si cambias las clases de Tailwind usadas en `index.html` o `app.js`, regenera la hoja de estilos con `npx tailwindcss@3.4.17 --content "index.html,app.js" --output glass-utilities.css`.

| Sección | Qué hace |
|---|---|
| Plantillas | Escribe `{{usuario}}`, `{{ticket}}`, etc. Al abrirla aparecen campos para rellenar y una vista previa en vivo. «Copiar texto» copia el resultado final. |
| Procesos | Un paso por línea. Se muestran como checklist con progreso. |
| Aprendizaje | Notas libres; una línea en blanco separa párrafos y los enlaces son clicables. |
| Fijadas | Entradas marcadas con el pin; siempre aparecen primero. |

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `Ctrl K` / `⌘ K` | Buscar en el espacio activo |
| `N` | Nueva entrada |
| `/` | Filtrar la lista |
| `↑` / `↓` | Moverse entre entradas |
| `C` | Copiar la entrada abierta |
| `E` | Editar |
| `P` | Fijar / desfijar |
| `Ctrl Enter` | Guardar en el editor |
| `Esc` | Cerrar |

## Copia de seguridad

Abre Configuración desde tu perfil y elige **Exportar** en **Respaldo de datos**.
