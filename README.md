# PULSO COMERCIAL DMB

Aplicativo para monitorear la actividad comercial diaria, el cumplimiento de metas y las brechas de desempeño del equipo comercial de DMB.

**Estado:** Etapas 0–3 construidas (base, registro diario, metas y motor de cálculo) como prototipo local. Los datos se guardan en el navegador; Supabase llega en una etapa posterior.

## Cómo ejecutarlo

Requisitos: Node.js 24 o superior (ya instalado en este equipo).

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173>.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm test` | Ejecuta las pruebas automáticas (motor, fechas, permisos) |
| `npm run build` | Revisa los tipos y genera la versión de producción en `dist/` |

## Usuarios iniciales del prototipo

| Usuario | Rol |
|---|---|
| `julian` | Administrador |
| `mariafernanda` | Directora comercial + comercial |

La contraseña inicial está en `src/datos/semilla.ts` (constante `CLAVE_INICIAL`). Cámbiala desde el menú del usuario → *Cambiar contraseña*. Al cargar los datos de demostración se crea además el usuario `demo` (comercial de bajo desempeño), con la misma contraseña inicial.

## Validar la funcionalidad

En **Pruebas** (solo administrador):

- **Cargar demostración:** 7 semanas de historia, metas, umbrales, un cambio de meta y un registro en sábado.
- **Fecha simulada:** hace que la aplicación funcione como si hoy fuera otra fecha. Sirve para probar el cambio de día, los fines de semana, los festivos y los cierres de semana y mes sin esperar días reales.
- **Respaldo:** exportar o importar todos los datos en JSON.

## Estructura

```
src/
  core/        Dominio puro, sin dependencias de interfaz ni de almacenamiento
    fechas.ts    Calendario hábil colombiano (festivos, Ley Emiliani)
    catalogo.ts  Indicadores, totales y ratios
    motor.ts     Meta del periodo, avance esperado, cumplimiento, semáforo, alertas
  datos/
    repositorio.ts  Contrato de datos + implementación local (se reemplaza por Supabase)
    permisos.ts     Reglas de acceso por rol (base de las políticas RLS)
    servicios.ts    Operaciones de negocio validadas contra el usuario
    semilla.ts      Usuarios iniciales y datos de demostración
  app/         Contexto global (sesión, fecha, notificaciones)
  ui/          Componentes reutilizables
  pantallas/   Login, Mi actividad, Desempeño, Registros, Metas, Equipo, Notificaciones, Pruebas
docs/
  reglas-y-decisiones.md   Reglas de negocio y decisiones tomadas
  ficha-construccion.md    Ficha SB360 original
```

## Hoja de ruta

| Etapa | Estado |
|---|---|
| 0. Cimientos (stack, modelo de datos, estructura) | ✅ |
| 1. Base del sistema: login, roles, equipo comercial | ✅ |
| 2. Registro comercial: formulario diario, edición del día, días excepcionales | ✅ |
| 3. Metas y motor de cálculo: vigencias, cumplimiento, semáforo, ratios, alertas | ✅ |
| 4. Dashboards: vista general (admin/directora), vista individual, gráficas | Pendiente |
| 5. Histórico: día, semana, mes, año, rango personalizado, tendencias | Pendiente |
| 6. Supabase: autenticación real, base de datos, RLS, despliegue | Pendiente |
| 7. Validación integral | Pendiente |
