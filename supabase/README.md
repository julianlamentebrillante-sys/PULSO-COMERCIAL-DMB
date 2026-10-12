# Supabase — PULSO COMERCIAL DMB

Base de datos, inicio de sesión y reglas de seguridad del aplicativo.

## Contenido

| Archivo | Qué es |
|---|---|
| `migrations/20261012000001_esquema_inicial.sql` | Tablas, festivos de Colombia, triggers, funciones de metas y reglas de seguridad (RLS) |
| `migrations/20261012000002_acceso_con_codigo.sql` | Acceso con código: autorizar personas, activar cuentas y restablecer contraseñas |
| `migrations/20261012000003_permisos_por_defecto.sql` | Retira los permisos automáticos de Supabase sobre tablas nuevas |
| `tests/esquema.test.ts` | 39 pruebas del esquema sobre PostgreSQL real (PGlite): se ejecutan con `npm test` |

La aplicación se conecta con las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ver `.env.example`). Sin ellas, funciona como prototipo local.

## Cómo se crean las cuentas (acceso con código)

1. El administrador, en **Equipo → Autorizar persona**, escribe nombre, correo, roles y fecha de inicio. La app genera un **código de activación** (vence en 7 días, un solo uso) y un mensaje listo para enviar.
2. La persona entra a la app → **Activar mi cuenta** → correo + código + **su propia contraseña**.
3. Si olvida la contraseña: **Equipo → Restablecer acceso** genera un código; la persona usa **Olvidé mi contraseña**.

Nadie más que la persona conoce su contraseña y no se envían correos. Sin un código válido, Supabase rechaza la creación de la cuenta.

## Qué garantiza la base de datos (aunque alguien se salte la aplicación)

- Un comercial solo **ve** sus propios registros, metas y perfil.
- Un comercial solo **crea o modifica su registro de hoy**. Días anteriores: solo el administrador.
- Nadie registra fechas futuras. Los registros no se borran.
- Los valores son enteros entre 0 y 9999, solo de indicadores válidos. Los faltantes se completan con 0.
- "Excepcional", autor, fechas y "corrección" los calcula el servidor: no se pueden falsear.
- Un registro en sábado, domingo o festivo **notifica al administrador** (una sola vez) y queda en el historial.
- Las metas nunca se superponen y no se pueden crear retroactivamente si ya hay historia.
- Solo el administrador configura metas, autoriza personas y edita perfiles, y no puede quitarse su propio rol.
- Los códigos de acceso se guardan cifrados (SHA-256), vencen en 7 días y sirven una sola vez.
- Usuarios anónimos no ven nada. Un usuario desactivado pierde todo acceso.

## Puesta en marcha (una sola vez)

### 1. Ejecutar las migraciones

En **SQL Editor**, ejecuta en orden el contenido de cada archivo de `migrations/`. Cada uno debe terminar en *Success*.

### 2. Configurar la autenticación

En **Authentication → Sign In / Providers**:
- **Allow new users to sign up:** **ACTIVADO**. Solo pueden registrarse correos autorizados con un código válido; la base de datos rechaza cualquier otro.
- **Confirm email:** **DESACTIVADO**. La identidad la confirma el código, y así no dependemos del envío de correos.
- Proveedor **Email:** activado.

### 3. Crear el primer administrador

1. **Authentication → Users → Add user → Create new user**: correo, contraseña y **Auto Confirm User** marcado.
2. En el **SQL Editor** (cambia el correo):

```sql
update public.perfiles
set nombre = 'Julián', roles = '{admin}', activo = true, fecha_inicio = public.hoy_bogota()
where correo = 'tu-correo@dementesbrillantes.com.co';
```

Con la migración 2 aplicada, el panel de Supabase ya no permite crear usuarios sin código. Si alguna vez hace falta otro administrador de emergencia, autorízalo desde la app con el rol Administrador.

### 4. Datos para conectar la aplicación

En **Project Settings → API / Data API**: **Project URL** y la clave **anon / publishable** (pública por diseño). **Nunca** compartas ni pongas en la aplicación la clave **service_role / secret**.
