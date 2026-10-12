// PULSO COMERCIAL DMB — Edge Function "gestionar-usuarios".
//
// Crea usuarios y restablece contraseñas. Corre en el servidor de Supabase con la
// clave service_role (que nunca va en la aplicación) y solo atiende a un
// administrador activo. Los roles viajan en app_metadata: el trigger
// crear_perfil_nuevo_usuario los lee para crear el perfil.
//
// Acciones (POST, JSON):
//   { "accion": "crear", "correo", "clave", "nombre", "roles": [...], "fecha_inicio": "AAAA-MM-DD" }
//   { "accion": "restablecer_clave", "id", "clave" }

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = ['admin', 'director', 'comercial'];
const MIN_CLAVE = 6;

function respuesta(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
const fallo = (mensaje: string, estado = 400) => respuesta({ error: mensaje }, estado);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fallo('Método no permitido.', 405);

  const servicio = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. ¿Quién llama? Debe ser un administrador activo.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quien } = await servicio.auth.getUser(token);
  if (!quien?.user) return fallo('Sesión no válida. Vuelve a iniciar sesión.', 401);
  const { data: perfil } = await servicio.from('perfiles').select('roles, activo').eq('id', quien.user.id).maybeSingle();
  if (!perfil?.activo || !(perfil.roles as string[]).includes('admin')) {
    return fallo('Solo el administrador puede gestionar usuarios.', 403);
  }

  let cuerpo: Record<string, unknown>;
  try { cuerpo = await req.json(); } catch { return fallo('Solicitud inválida.'); }

  // 2. Acciones
  if (cuerpo.accion === 'crear') {
    const correo = String(cuerpo.correo ?? '').trim().toLowerCase();
    const clave = String(cuerpo.clave ?? '');
    const nombre = String(cuerpo.nombre ?? '').trim();
    const roles = Array.isArray(cuerpo.roles) ? [...new Set(cuerpo.roles.map(String))] : [];
    const fechaInicio = String(cuerpo.fecha_inicio ?? '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return fallo('Escribe un correo electrónico válido.');
    if (clave.length < MIN_CLAVE) return fallo(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres.`);
    if (nombre.length < 2) return fallo('Escribe el nombre de la persona.');
    if (!roles.length || !roles.every((r) => ROLES.includes(r))) return fallo('Roles no válidos.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)) return fallo('Indica una fecha de inicio válida.');

    const { data, error } = await servicio.auth.admin.createUser({
      email: correo,
      password: clave,
      email_confirm: true,
      app_metadata: { nombre, roles, fecha_inicio: fechaInicio, creado_por: quien.user.id },
    });
    if (error) {
      const yaExiste = /already (been )?registered|already exists/i.test(error.message);
      return fallo(yaExiste ? 'Ya existe una persona con ese correo.' : error.message);
    }
    return respuesta({ id: data.user.id });
  }

  if (cuerpo.accion === 'restablecer_clave') {
    const id = String(cuerpo.id ?? '');
    const clave = String(cuerpo.clave ?? '');
    if (!id) return fallo('Falta indicar el usuario.');
    if (clave.length < MIN_CLAVE) return fallo(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres.`);
    const { error } = await servicio.auth.admin.updateUserById(id, { password: clave });
    if (error) return fallo(error.message);
    return respuesta({ id });
  }

  return fallo('Acción no reconocida.');
});
