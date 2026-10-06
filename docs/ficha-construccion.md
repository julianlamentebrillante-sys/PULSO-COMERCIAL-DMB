# Ficha de Construcción de Solución — PULSO COMERCIAL DMB

## 1. Identificación

**Nombre de la solución:**  
PULSO COMERCIAL DMB

**Problema que resuelve:**  
DMB necesita monitorear de forma simple y frecuente la actividad comercial, el cumplimiento de metas y las brechas de desempeño del equipo, sin depender de registros dispersos ni procesos manuales de consolidación.

**Usuarios principales:**  
- Administrador / líder comercial.
- Comerciales.

**Usuarios iniciales:**  
- Julián: Administrador.
- María Fernanda: Directora Comercial y comercial activa.

**Momento de uso:**  
Seguimiento diario de actividad comercial y revisiones periódicas semanales, mensuales y anuales.

**Resultado esperado:**  
Permitir identificar rápidamente:
- Qué actividad comercial se está ejecutando.
- Cómo avanza cada comercial frente a sus metas.
- Dónde existen brechas.
- Qué indicadores requieren atención.
- Cuándo puede ser necesario acompañamiento.
- Cómo evoluciona el desempeño comercial en el tiempo.

---

## 2. Modelo funcional

### 2.1 Inputs

#### Registro diario del comercial
- Invitaciones a conectar enviadas.
- Conexiones aceptadas.
- Prospectos obtenidos.
- Contactos realizados.
- Contactos efectivos.
- Reuniones de Sinergia agendadas.
- Reuniones de presentación agendadas.
- Reuniones de seguimiento agendadas.
- Reuniones de Sinergia realizadas.
- Reuniones de presentación realizadas.
- Reuniones de seguimiento realizadas.
- Propuestas comerciales presentadas.
- Oportunidades comerciales reales.

#### Configuración del administrador
- Comerciales.
- Metas diarias.
- Metas semanales.
- Metas mensuales.
- Vigencia de las metas.

### 2.2 Datos a conservar
- Usuarios.
- Roles.
- Comerciales activos e inactivos.
- Registros diarios.
- Metas.
- Vigencia de metas.
- Histórico de actividad.
- Histórico de cumplimiento.
- Histórico de metas anteriores.

### 2.3 Reglas
- Cada comercial registra únicamente su propia actividad.
- Cada comercial ve únicamente su información.
- El administrador ve todo el equipo.
- Las metas pueden configurarse de manera independiente como diarias, semanales y/o mensuales.
- No es obligatorio que todos los indicadores tengan las tres periodicidades.
- Los registros diarios pueden actualizarse durante el mismo día.
- Los días comerciales son lunes a viernes.
- Las metas históricas deben conservarse.
- Un nuevo comercial puede agregarse sin alterar la estructura del aplicativo.

### 2.4 Cálculos

**Total reuniones comerciales agendadas**  
= Reuniones de Sinergia agendadas  
+ Reuniones de presentación agendadas  
+ Reuniones de seguimiento agendadas

**Total reuniones comerciales realizadas**  
= Reuniones de Sinergia realizadas  
+ Reuniones de presentación realizadas  
+ Reuniones de seguimiento realizadas

**Cumplimiento**  
= Realizado ÷ Meta × 100

También se deben calcular:
- Cumplimiento diario.
- Cumplimiento semanal.
- Cumplimiento mensual.
- Acumulados.
- Diferencia frente a meta.
- Avance esperado del periodo.
- Tasas de efectividad.
- Tendencias históricas.

### 2.5 Ratios útiles
- Conexiones aceptadas ÷ Invitaciones enviadas.
- Prospectos obtenidos ÷ Conexiones aceptadas.
- Contactos efectivos ÷ Contactos realizados.
- Reuniones realizadas ÷ Reuniones agendadas.

### 2.6 Decisiones que apoya
- Identificar baja actividad.
- Detectar incumplimiento.
- Detectar baja efectividad.
- Identificar necesidad de acompañamiento.
- Priorizar focos de gestión comercial.
- Analizar evolución histórica.
- Comparar comerciales desde la vista del administrador.

### 2.7 Outputs
- Indicadores numéricos.
- Porcentajes de cumplimiento.
- Semáforos.
- Alertas.
- Gráficas.
- Tendencias.
- Vista global.
- Vista individual.
- Histórico por periodo.

---

## 3. Especificación

### 3.1 Funcionalidades principales
1. Inicio de sesión.
2. Gestión de usuarios.
3. Gestión de comerciales.
4. Configuración de metas.
5. Registro diario de actividad.
6. Actualización del registro del día.
7. Dashboard general.
8. Dashboard individual.
9. Selector Hoy / Semana / Mes.
10. Semáforos de cumplimiento.
11. Cálculo automático de reuniones.
12. Cálculo de ratios.
13. Histórico.
14. Consulta por rango de fechas.
15. Visualización anual.
16. Activar o desactivar comerciales.

### 3.2 Pantallas principales

#### 1. Login
Acceso mediante usuario y contraseña.

#### 2. Dashboard general
Solo administrador.

Debe mostrar:
- Resultado global.
- Alertas.
- Cumplimiento.
- Comerciales.
- Selector de periodo.
- Tendencias.
- Acceso al detalle individual.

#### 3. Mi actividad
Para comerciales.

Formulario rápido con todos los indicadores.

**Objetivo de UX:** completarlo en máximo 5 minutos.

#### 4. Mi desempeño
Para comerciales.

Debe mostrar:
- Meta.
- Realizado.
- Cumplimiento.
- Semáforo.
- Tendencia.
- Histórico personal.

#### 5. Detalle de comercial
Solo administrador.

Permite analizar cualquier miembro del equipo.

#### 6. Metas
Solo administrador.

Permite establecer metas por:
- Comercial.
- Indicador.
- Periodicidad.
- Vigencia.

#### 7. Equipo comercial
Solo administrador.

Permite:
- Crear.
- Editar.
- Activar.
- Desactivar.

#### 8. Histórico
Debe permitir filtrar por:
- Comercial.
- Día.
- Semana.
- Mes.
- Año.
- Rango personalizado.

---

## 4. Reglas del semáforo

- **Verde:** 100 % o más del avance esperado.
- **Amarillo:** entre 70 % y 99 % del avance esperado.
- **Rojo:** menos de 70 % del avance esperado.

La evaluación debe considerar el momento del periodo para no penalizar anticipadamente una meta semanal o mensual.

---

## 5. Roles y permisos

### Administrador
Puede:
- Ver dashboard general.
- Ver todos los comerciales.
- Crear y desactivar comerciales.
- Configurar metas.
- Consultar históricos.
- Ver alertas.
- Consultar detalle individual.
- Comparar desempeño entre comerciales.

### Comercial
Puede:
- Registrar su propia actividad.
- Modificar su registro del día.
- Ver sus propios indicadores.
- Ver sus propias metas.
- Ver su progreso.
- Consultar su propio histórico.

**Restricción:** ningún comercial puede ver el desempeño de otros comerciales.

---

## 6. Restricciones del MVP

Quedan fuera de esta primera versión:
- CRM.
- Pipeline de oportunidades.
- Clientes.
- Empresas.
- Contactos individuales.
- Valor de oportunidades.
- Integración con LinkedIn.
- WhatsApp.
- Correos.
- Agenda comercial.
- Automatizaciones.
- IA predictiva.
- Gestión documental.

---

## 7. Criterios de aceptación

El MVP se considerará funcional cuando se pueda comprobar que:

1. Un administrador puede crear un comercial.
2. Un comercial puede iniciar sesión.
3. Un comercial solo puede acceder a sus propios datos.
4. El administrador puede ver todo el equipo.
5. Se pueden configurar metas diarias, semanales y mensuales.
6. El comercial puede registrar toda su actividad diaria en aproximadamente 5 minutos.
7. El registro puede modificarse durante el mismo día.
8. Los datos permanecen guardados después de cerrar sesión.
9. Los totales de reuniones se calculan automáticamente.
10. Los porcentajes de cumplimiento son correctos.
11. El semáforo responde correctamente a los rangos establecidos.
12. El avance semanal y mensual considera únicamente lunes a viernes.
13. Se puede consultar información histórica.
14. Se puede cambiar entre Hoy / Semana / Mes.
15. Se puede consultar un periodo anual.
16. Se puede consultar un rango personalizado.
17. Los cambios de metas no modifican los resultados históricos anteriores.
18. Agregar un nuevo comercial no requiere modificar la aplicación.

---

## 8. Plan de construcción

### Módulo 1 — Base del sistema
- Usuarios.
- Login.
- Roles.
- Comerciales.
- Persistencia.

### Módulo 2 — Registro comercial
- Formulario diario.
- Edición.
- Almacenamiento.

### Módulo 3 — Metas y cálculos
- Metas.
- Cumplimiento.
- Reuniones automáticas.
- Semáforo.

### Módulo 4 — Dashboard
- Vista administrador.
- Vista comercial.

### Módulo 5 — Histórico
- Día.
- Semana.
- Mes.
- Año.
- Rango personalizado.

### Módulo 6 — Validación integral
- Permisos.
- Cálculos.
- Históricos.
- Errores.
- Casos límite.

---

## 9. Estado metodológico SB360

- **Definir:** Completado.
- **Modelar:** Completado.
- **Especificar:** Completado.
- **Construir:** Siguiente etapa.
- **Validar:** Pendiente.
- **Mejorar:** Pendiente.
