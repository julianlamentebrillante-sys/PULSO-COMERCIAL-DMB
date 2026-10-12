# Supabase — PULSO COMERCIAL DMB

Base de datos, inicio de sesión y reglas de seguridad del aplicativo.

## Contenido

| Archivo | Qué es |
|---|---|
| `migrations/20261012000001_esquema_inicial.sql` | Tablas, festivos de Colombia, triggers, funciones de metas y reglas de seguridad (RLS) |
| `functions/gestionar-usuarios/index.ts` | Edge Function: crear usuarios y restablecer contraseñas (solo administrador) |
| `tests/esquema.test.ts` | 30 pruebas del esquema sobre PostgreSQL real (PGlite): se ejecutan con `npm test` |

La aplicación se conecta con las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ver `.env.example`). Sin ellas, funciona como prototipo local.

## Qué garantiza la base de datos (aunque alguien se salte la aplicación)

- Un comercial solo **ve** sus propios registros, metas y perfil.
- Un comercial solo **crea o modifica su registro de hoy**. Días anteriores: solo el administrador.
- Nadie registra fechas futuras. Los registros no se borran.
- Los valores son enteros entre 0 y 9999, solo de indicadores válidos. Los faltantes se completan con 0.
- "Excepcional", autor, fechas y "corrección" los calcula el servidor: no se pueden falsear.
- Un registro en sábado, domingo o festivo **notifica al administrador** (una sola vez) y queda en el historial.
- Las metas nunca se superponen y no se pueden crear retroactivamente si ya hay historia.
- Solo el administrador configura metas y edita perfiles, y no puede quitarse su propio rol.
- Los roles solo se asignan desde el servidor: nadie puede registrarse como administrador.
- Usuarios anónimos no ven nada. Un usuario desactivado pierde todo acceso.

## Puesta en marcha (una sola vez)

### 1. Crear las tablas

1. En [supabase.com](https://supabase.com), abre el proyecto `pulso-comercial-dmb`.
2. En el menú izquierdo, entra a **SQL Editor** → **New query**.
3. Copia todo el contenido de `migrations/20261012000001_esquema_inicial.sql`, pégalo y haz clic en **Run**.
4. Debe aparecer *Success. No rows returned*.

### 2. Cerrar el registro público

En **Authentication** → **Sign In / Providers**:
- Desactiva **Allow new users to sign up**. Las cuentas solo las crea el administrador.
- Deja activo el proveedor **Email**.

### 3. Crear tu usuario administrador

1. Ve a **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escribe tu correo y una contraseña, marca **Auto Confirm User** y haz clic en **Create user**.
3. Vuelve al **SQL Editor** y ejecuta (cambia el correo por el tuyo):

```sql
update public.perfiles
set nombre = 'Julián', roles = '{admin}', activo = true, fecha_inicio = public.hoy_bogota()
where correo = 'tu-correo@dementesbrillantes.com.co';
```

Por seguridad, un usuario creado sin roles queda **inactivo** hasta que se le asignen. Esta consulta te activa como administrador.

### 4. Crear a María Fernanda

Repite el paso 3 con su correo y ejecuta:

```sql
update public.perfiles
set nombre = 'María Fernanda', roles = '{director,comercial}', activo = true, fecha_inicio = public.hoy_bogota()
where correo = 'correo-de-maria@dementesbrillantes.com.co';
```

Después de este paso, los demás usuarios se crean desde la pantalla **Equipo** de la aplicación (requiere el paso 5).

### 5. Publicar la función de usuarios

La pantalla **Equipo** crea usuarios y restablece contraseñas mediante una Edge Function, porque esas operaciones requieren la clave secreta, que nunca va dentro de la aplicación.

1. En el menú izquierdo, entra a **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. **Nombre de la función:** `gestionar-usuarios` (exactamente así).
3. Borra el código de ejemplo y pega todo el contenido de `functions/gestionar-usuarios/index.ts`.
4. Haz clic en **Deploy function**.

No hay que configurar nada más: Supabase entrega automáticamente a la función la URL y la clave secreta del proyecto.

### 6. Datos para conectar la aplicación

En **Project Settings** → **API** (o **Data API**), copia:
- **Project URL**
- La clave **anon / publishable**. Es pública por diseño: la seguridad la dan las reglas RLS.

**Nunca** compartas ni pongas en la aplicación la clave **service_role / secret**.
