# Reglas de negocio y decisiones — PULSO COMERCIAL DMB

Complementa la ficha de construcción (`ficha-construccion.md`) con las definiciones acordadas el 5 de octubre de 2026 y las decisiones de diseño tomadas en la construcción.

## 1. Definiciones acordadas con Julián (5 oct 2026)

| # | Tema | Definición |
|---|---|---|
| 1 | Roles de María Fernanda | Es **directora comercial y comercial**. Como directora ve la gestión de todos los comerciales. Un usuario puede tener varios roles. |
| 2 | Días hábiles | Lunes a viernes, **excluyendo sábados, domingos y festivos de Colombia**. |
| 3 | Registros olvidados | El comercial solo registra o modifica **el día de hoy**. Los días anteriores **solo los corrige el administrador**, para crear disciplina de registro diario. |
| 4 | Alertas | Se disparan cuando **no se cumple un indicador** y también **cuando no hay registro**. |
| 5 | Ratios | Tienen **umbral y semáforo**. |
| 6 | Metas | Se pueden fijar sobre los **totales de reuniones agendadas/realizadas** y sobre **cada indicador individual**. |
| 7 | Corte de evaluación | La evaluación llega **hasta el registro del día anterior**. |
| 8 | Fines de semana | Se **permite** registrar en sábado (y domingo o festivo), pero **se notifica al administrador**: es excepcional, no norma. |

## 2. Roles y permisos

| Acción | Comercial | Director(a) | Administrador |
|---|:-:|:-:|:-:|
| Registrar su propia actividad (solo hoy) | ✅ | ✅ si también es comercial | — |
| Ver su propio desempeño y metas | ✅ | ✅ | — |
| Ver desempeño y registros de todo el equipo | — | ✅ | ✅ |
| Corregir registros de días anteriores | — | — | ✅ |
| Configurar metas y umbrales | — | — | ✅ |
| Crear, editar, activar y desactivar personas | — | — | ✅ |
| Recibir notificaciones de registros excepcionales | — | — | ✅ |

Los permisos se validan en la capa de servicios (`src/datos/servicios.ts`), no en la pantalla. En Supabase se replicarán como políticas Row Level Security.

## 3. Cálculos

- **Totales de reuniones** = Sinergia + Presentación + Seguimiento (agendadas y realizadas por separado), calculados automáticamente.
- **Aporte diario de una meta:** cada meta reparte su valor entre los días hábiles de su periodo. Meta semanal de 10 en una semana de 5 días hábiles = 2 por día; en una semana con festivo (4 días) = 2,5 por día.
- **Meta del periodo** = suma de los aportes de todos sus días hábiles.
- **Avance esperado** = suma de los aportes de los días hábiles transcurridos hasta el corte (ayer).
- **Cumplimiento** = Realizado ÷ Meta × 100.
- **Semáforo** = Realizado ÷ Avance esperado × 100 → **verde** ≥ 100 %, **amarillo** 70–99 %, **rojo** < 70 %.
- **Hoy** siempre aparece "en curso": no tiene semáforo ni genera alertas.
- **Ratios:** valor = numerador ÷ denominador del periodo; semáforo = valor ÷ umbral × 100 con los mismos rangos.
- **Actividad en días no hábiles:** suma a lo realizado, pero no al avance esperado.

## 4. Metas y vigencias

- Una meta se define por **comercial × indicador × periodicidad (diaria / semanal / mensual) × vigencia (desde–hasta)**. Los ratios usan un **umbral mínimo** en porcentaje.
- No todos los indicadores necesitan las tres periodicidades.
- **Nunca se sobrescribe una meta:** una nueva cierra la anterior el día previo. Así los periodos pasados siguen evaluándose con la meta que tenían (criterio de aceptación 17).
- Si ya existe historia para esa combinación, la nueva meta solo puede regir **desde hoy o una fecha futura**. La **primera** meta sí puede empezar en el pasado, para cargar la línea base.
- *Finalizar* una meta vigente la cierra ayer. Una meta programada que aún no ha empezado se elimina.
- **Meta derivada (solo de referencia):** si una vista no tiene meta de su periodicidad, usa otra (p. ej. la semana suma las metas diarias). Se marca con `*`.

## 5. Alertas

Se calculan con los registros hasta ayer y solo para comerciales activos:

1. **Sin registro:** días hábiles sin registro en los últimos 30 días, desde la fecha de inicio del comercial. Severidad crítica.
2. **Día anterior:** metas **diarias** incumplidas el último día hábil.
3. **Semana y mes en curso:** metas **semanales / mensuales** por debajo del avance esperado.
4. **Ratios** por debajo del umbral (semana y mes).

Rojo = crítica, amarillo = atención. Las alertas usan solo metas configuradas explícitamente con su periodicidad, para no duplicar avisos con metas derivadas.

## 6. Tableros (Etapa 4)

| Pantalla | Quién la ve | Contenido |
|---|---|---|
| **Tablero del equipo** | Administrador, director(a) | Índice del equipo, registro de hoy, días sin registro, alertas, KPI clave, cumplimiento por comercial, tendencia comparada y alertas del equipo |
| **Mi desempeño** | Comercial | Su índice, KPI clave, tendencia del índice, tendencia de un indicador (realizado vs. meta), alertas y detalle |
| **Detalle de comercial** | Administrador, director(a) | Lo mismo que *Mi desempeño*, para cualquier comercial (desde el tablero) |

- **Índice de cumplimiento** = promedio del cumplimiento frente al esperado de los indicadores con meta evaluada, **cada uno topado en 100 %**. Así, sobrecumplir un indicador no tapa la brecha de otro. Su semáforo usa los mismos rangos (100 / 70).
- **Consolidado del equipo:** meta y esperado = suma de los de cada comercial. El cumplimiento solo compara lo realizado por quienes tienen meta en ese indicador. Los ratios se recalculan con las sumas y su umbral es el promedio de los umbrales individuales.
- **Indicadores clave** en tarjetas: prospectos, total de reuniones agendadas, total de reuniones realizadas, propuestas y oportunidades.
- **Tendencias:** últimos 10 días hábiles, 8 semanas o 6 meses, según el selector. El periodo en curso no tiene índice hasta que transcurre al menos un día hábil.
- **Gráficas:** el color sigue a la persona (orden fijo del equipo), nunca a su posición en un ranking. Hay leyenda, tooltip y vista de tabla en cada gráfica. La paleta está validada para daltonismo hasta 4 comerciales; con más, la tabla comparativa incluye a todos.
- El tablero muestra solo comerciales **activos**.

### Histórico (Etapa 5)

- Lo ve todo usuario: el comercial solo el suyo; administración y dirección eligen un comercial o el **equipo consolidado**.
- **Rangos:** este mes, mes anterior, últimos 30 días, últimos 3 meses, este año, año anterior o personalizado (máximo 3 años).
- **Agrupación** por día (máximo 93 días), semana o mes. Los tramos de los extremos se recortan al rango, así la suma de los tramos es exactamente el rango, y la meta de un tramo parcial se prorratea por días hábiles.
- Un año calendario completo se evalúa como año (visualización anual); por defecto se agrupa por mes.
- **Días registrados / exigibles:** se cuentan desde la fecha de inicio de cada comercial.
- **Descarga CSV** con separador `;` y coma decimal, lista para abrir en Excel en español.

### Identidad visual

- Colores corporativos de Dementes Brillantes: **negro, naranja y blanco**. Barra y botones principales en negro, el naranja como acento (marca, navegación activa, insignias, títulos de grupo) y fondos blancos.
- Valores oficiales: naranja `#ED741C`, negro `#010101`, blanco `#FFFFFF`. El naranja sobre blanco tiene contraste 2,95:1: se usa en marca, acentos y gráficas; para texto pequeño sobre blanco se usa `#B0530F` (5,1:1, WCAG AA).
- Las gráficas usan el naranja de marca como primera serie. El orden de colores está validado para daltonismo.
- Los colores del semáforo (verde, amarillo, rojo) no cambian: son colores de estado, no de marca.

## 7. Decisiones técnicas

| Decisión | Motivo |
|---|---|
| Vite + React + TypeScript | Lenguaje final del aplicativo. Supabase será el backend, así que no se necesita servidor propio (Next.js); una app estática se despliega gratis. |
| Motor de cálculo puro y probado (Vitest) | Es donde más fácil se cuelan errores (festivos, prorrateos, umbrales). 59 pruebas automáticas cubren los criterios de aceptación de cálculo y permisos. |
| Repositorio con contrato (`Repositorio`) | El prototipo usa el almacenamiento del navegador; Supabase será otra implementación del mismo contrato, sin tocar pantallas ni motor. |
| Fechas como texto `AAAA-MM-DD` y zona horaria de Bogotá | Evita errores de zona horaria; "hoy" es siempre el día en Colombia. |
| Festivos calculados (no una lista fija) | Ley Emiliani y festivos ligados a la Pascua se calculan para cualquier año. |
| Contraseñas con hash simple en el prototipo | Solo para no guardarlas en texto plano en el navegador. **No es seguridad real**: en producción la autenticación será Supabase Auth. |

## 8. Supabase (Etapa 6)

- **Inicio de sesión con correo** (Supabase Auth) en lugar de usuario; permite recuperar contraseña.
- Las reglas de permisos, validaciones, días excepcionales, notificaciones y vigencia de metas se aplican **en la base de datos** (RLS, triggers y funciones), no solo en la aplicación. Detalle en `supabase/README.md`.
- Los roles se leen de `app_metadata` (solo el servidor la escribe). Un usuario sin roles queda inactivo.
- Registro público desactivado: solo el administrador crea cuentas.

## 9. Decisiones posteriores

| Fecha | Tema | Decisión |
|---|---|---|
| 5 oct 2026 | Alertas a inicio de periodo con metas bajas (p. ej. 0 de 0,3 esperados) | **Se dejan tal cual.** No se esperan metas tan bajas y la alerta temprana ayuda a presionar el cumplimiento. |
