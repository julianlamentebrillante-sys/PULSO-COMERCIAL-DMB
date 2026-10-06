import { describe, expect, it } from 'vitest';
import * as F from './fechas';
import * as M from './motor';
import { calcularTotales } from './catalogo';
import type { Meta, Periodicidad, Registro, TipoPeriodo, Usuario, Valores } from './tipos';

const USUARIO: Usuario = {
  id: 'u1', nombre: 'Prueba', usuario: 'prueba', roles: ['comercial'],
  fechaInicio: '2026-09-01', activo: true, creado: '2026-09-01T00:00:00Z',
};

function meta(indicador: string, periodicidad: Periodicidad, valor: number, desde = '2026-09-01', hasta: string | null = null): Meta {
  return { id: `${indicador}-${periodicidad}-${desde}`, userId: 'u1', indicador, periodicidad, valor, desde, hasta, creado: '', creadoPor: '' };
}

function registro(fecha: string, valores: Valores): Registro {
  return {
    id: fecha, userId: 'u1', fecha, valores, excepcional: !F.esHabil(fecha),
    creado: '', actualizado: '', actualizadoPor: 'u1', corregidoPorAdmin: false, historial: [],
  };
}

function evaluar(metas: Meta[], registros: Registro[], tipo: Exclude<TipoPeriodo, 'rango'>, fecha: string, hoy: string) {
  return M.evaluarPeriodo({ usuario: USUARIO, metas, registros, tipo, periodo: F.periodo(tipo, fecha), hoy });
}

const ind = (ev: M.Evaluacion, id: string) => ev.indicadores.find((i) => i.id === id)!;
const rat = (ev: M.Evaluacion, id: string) => ev.ratios.find((r) => r.id === id)!;

describe('Totales de reuniones', () => {
  it('suma agendadas y realizadas automáticamente', () => {
    const v = calcularTotales({ sinergia_agendadas: 1, presentacion_agendadas: 2, seguimiento_agendadas: 3, sinergia_realizadas: 1, seguimiento_realizadas: 1 });
    expect(v.total_agendadas).toBe(6);
    expect(v.total_realizadas).toBe(2);
    expect(v.invitaciones).toBe(0);
  });
});

describe('Semáforo', () => {
  it('respeta los umbrales 100 % y 70 %', () => {
    expect(M.semaforo(100)).toBe('verde');
    expect(M.semaforo(150)).toBe('verde');
    expect(M.semaforo(99.99)).toBe('amarillo');
    expect(M.semaforo(70)).toBe('amarillo');
    expect(M.semaforo(69.99)).toBe('rojo');
    expect(M.semaforo(0)).toBe('rojo');
    expect(M.semaforo(null)).toBe('sin_meta');
  });
});

describe('Avance esperado y cumplimiento', () => {
  const metas = [meta('prospectos', 'semanal', 10)];
  const regs = [registro('2026-10-05', { prospectos: 2 }), registro('2026-10-06', { prospectos: 2 })];

  it('evalúa la semana hasta el día anterior (miércoles → lunes y martes)', () => {
    const r = ind(evaluar(metas, regs, 'semana', '2026-10-07', '2026-10-07'), 'prospectos');
    expect(r.meta).toBe(10);
    expect(r.esperado).toBe(4);
    expect(r.realizado).toBe(4);
    expect(r.cumplimientoEsperado).toBe(100);
    expect(r.cumplimientoMeta).toBe(40);
    expect(r.diferenciaMeta).toBe(-6);
    expect(r.estado).toBe('verde');
  });

  it('no penaliza el primer día de la semana: queda "en curso"', () => {
    const ev = evaluar(metas, [registro('2026-10-05', { prospectos: 1 })], 'semana', '2026-10-05', '2026-10-05');
    expect(ev.evalFin).toBeNull();
    expect(ind(ev, 'prospectos').estado).toBe('en_curso');
    expect(ind(ev, 'prospectos').realizadoActual).toBe(1);
  });

  it('el día de hoy siempre está "en curso"', () => {
    const r = ind(evaluar([meta('invitaciones', 'diaria', 20)], [registro('2026-10-07', { invitaciones: 3 })], 'dia', '2026-10-07', '2026-10-07'), 'invitaciones');
    expect(r.estado).toBe('en_curso');
    expect(r.avanceActual).toBe(15);
  });

  it('reparte la meta semanal entre 4 días cuando hay festivo', () => {
    const r = ind(evaluar([meta('prospectos', 'semanal', 8)], [registro('2026-10-13', { prospectos: 1 })], 'semana', '2026-10-14', '2026-10-14'), 'prospectos');
    expect(r.esperado).toBe(2); // solo martes 13 transcurrido (lunes 12 es festivo), 8 / 4
    expect(r.cumplimientoEsperado).toBe(50);
    expect(r.estado).toBe('rojo');
  });

  it('evalúa el mes con amarillo y rojo según el avance esperado', () => {
    const metas42 = [meta('oportunidades', 'mensual', 42)]; // 21 días hábiles → 2 por día
    const dias = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
    const r9 = ind(evaluar(metas42, dias.map((f, i) => registro(f, { oportunidades: i < 3 ? 2 : 1 })), 'mes', '2026-10-09', '2026-10-09'), 'oportunidades');
    expect(r9.esperado).toBe(12);
    expect(r9.realizado).toBe(9);
    expect(r9.estado).toBe('amarillo');
    const r8 = ind(evaluar(metas42, dias.map((f, i) => registro(f, { oportunidades: i < 2 ? 2 : 1 })), 'mes', '2026-10-09', '2026-10-09'), 'oportunidades');
    expect(r8.realizado).toBe(8);
    expect(r8.estado).toBe('rojo');
  });

  it('evita errores de coma flotante en los umbrales', () => {
    // 7 / 21 por día × 3 días = 1 exacto
    const r = ind(evaluar([meta('oportunidades', 'mensual', 7)], [registro('2026-10-02', { oportunidades: 1 })], 'mes', '2026-10-06', '2026-10-06'), 'oportunidades');
    expect(r.esperado).toBe(1);
    expect(r.estado).toBe('verde');
  });

  it('suma la actividad de un sábado a lo realizado, pero no al esperado', () => {
    const ev = evaluar(metas, [...regs, registro('2026-10-10', { prospectos: 5 })], 'semana', '2026-10-05', '2026-10-12');
    expect(ind(ev, 'prospectos').realizado).toBe(9);
    expect(ind(ev, 'prospectos').esperado).toBe(10);
    expect(ev.diasExcepcionales).toEqual(['2026-10-10']);
  });

  it('las metas sobre totales de reuniones usan la suma automática', () => {
    const r = ind(evaluar([meta('total_realizadas', 'semanal', 5)], [registro('2026-10-05', { sinergia_realizadas: 1, presentacion_realizadas: 1, seguimiento_realizadas: 1 })], 'semana', '2026-10-05', '2026-10-07'), 'total_realizadas');
    expect(r.realizado).toBe(3);
    expect(r.esperado).toBe(2);
    expect(r.estado).toBe('verde');
  });
});

describe('Vigencia de metas e histórico', () => {
  const metas = [
    meta('invitaciones', 'diaria', 20, '2026-09-01', '2026-10-04'),
    meta('invitaciones', 'diaria', 30, '2026-10-05'),
  ];

  it('cada periodo usa la meta vigente en su momento', () => {
    expect(ind(evaluar(metas, [], 'semana', '2026-09-28', '2026-10-20'), 'invitaciones').meta).toBe(100);
    expect(ind(evaluar(metas, [], 'semana', '2026-10-05', '2026-10-20'), 'invitaciones').meta).toBe(150);
  });

  it('agregar una meta nueva no cambia el resultado de un periodo pasado', () => {
    const antes = evaluar([meta('invitaciones', 'diaria', 20)], [], 'semana', '2026-09-28', '2026-10-20');
    const despues = evaluar(metas, [], 'semana', '2026-09-28', '2026-10-20');
    expect(ind(despues, 'invitaciones').meta).toBe(ind(antes, 'invitaciones').meta);
  });

  it('prorratea un cambio de meta a mitad de mes', () => {
    const r = ind(evaluar([meta('invitaciones', 'diaria', 20, '2026-10-01', '2026-10-09'), meta('invitaciones', 'diaria', 10, '2026-10-13')], [], 'mes', '2026-10-01', '2026-11-01'), 'invitaciones');
    // 1–9 oct: 7 días hábiles × 20 = 140; 13–30 oct: 14 días hábiles × 10 = 140
    expect(r.meta).toBe(280);
  });
});

describe('Metas derivadas', () => {
  it('sin meta semanal, la semana suma las metas diarias', () => {
    const r = ind(evaluar([meta('invitaciones', 'diaria', 20)], [], 'semana', '2026-10-05', '2026-10-20'), 'invitaciones');
    expect(r.meta).toBe(100);
    expect(r.metaDerivada).toBe(true);
  });

  it('sin meta mensual, el mes suma las metas diarias de sus días hábiles', () => {
    expect(ind(evaluar([meta('invitaciones', 'diaria', 20)], [], 'mes', '2026-10-01', '2026-11-05'), 'invitaciones').meta).toBe(420);
  });

  it('prefiere la meta de la misma periodicidad', () => {
    const r = ind(evaluar([meta('propuestas', 'diaria', 1), meta('propuestas', 'semanal', 2)], [], 'semana', '2026-10-05', '2026-10-20'), 'propuestas');
    expect(r.meta).toBe(2);
    expect(r.metaDerivada).toBe(false);
  });
});

describe('Ratios', () => {
  it('calcula el valor y lo compara con el umbral', () => {
    const ev = evaluar([meta('tasa_aceptacion', 'umbral', 30)], [registro('2026-10-05', { invitaciones: 100, conexiones: 25 })], 'semana', '2026-10-05', '2026-10-07');
    const r = rat(ev, 'tasa_aceptacion');
    expect(r.valor).toBe(25);
    expect(r.cumplimiento).toBeCloseTo(83.3333, 3);
    expect(r.estado).toBe('amarillo');
  });

  it('sin denominador queda "sin datos"', () => {
    expect(rat(evaluar([meta('tasa_aceptacion', 'umbral', 30)], [], 'semana', '2026-10-05', '2026-10-07'), 'tasa_aceptacion').estado).toBe('sin_datos');
  });

  it('sin umbral queda "sin meta"', () => {
    expect(rat(evaluar([], [registro('2026-10-05', { invitaciones: 10, conexiones: 5 })], 'semana', '2026-10-05', '2026-10-07'), 'tasa_aceptacion').estado).toBe('sin_meta');
  });
});

describe('Días sin registro y alertas', () => {
  it('detecta días hábiles sin registro desde la fecha de inicio', () => {
    const ev = evaluar([], [registro('2026-10-05', {})], 'semana', '2026-10-05', '2026-10-08');
    expect(ev.diasSinRegistro).toEqual(['2026-10-06', '2026-10-07']);
  });

  it('genera alerta crítica por días sin registro', () => {
    const usuario = { ...USUARIO, fechaInicio: '2026-10-05' };
    const alertas = M.generarAlertas({ usuario, metas: [], registros: [registro('2026-10-05', {})], hoy: '2026-10-08' });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'sin_registro', severidad: 'critica', fechas: ['2026-10-06', '2026-10-07'] });
  });

  it('genera alertas por indicador solo con metas explícitas de cada periodo', () => {
    const usuario = { ...USUARIO, fechaInicio: '2026-10-05' };
    const regs = ['2026-10-05', '2026-10-06', '2026-10-07'].map((f) => registro(f, { invitaciones: 10, prospectos: 0 }));
    const alertas = M.generarAlertas({
      usuario, registros: regs, hoy: '2026-10-08',
      metas: [meta('invitaciones', 'diaria', 20), meta('prospectos', 'semanal', 10)],
    });
    const resumen = alertas.map((a) => `${a.tipo}:${'indicador' in a ? a.indicador : ''}:${'periodoTipo' in a ? a.periodoTipo : ''}`);
    expect(resumen).toContain('indicador:invitaciones:dia');
    expect(resumen).toContain('indicador:prospectos:semana');
    // La meta diaria no genera alerta semanal ni mensual derivada.
    expect(resumen).not.toContain('indicador:invitaciones:semana');
    expect(resumen).not.toContain('indicador:invitaciones:mes');
  });

  it('el lunes evalúa la semana anterior completa', () => {
    const usuario = { ...USUARIO, fechaInicio: '2026-10-05' };
    const regs = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((f) => registro(f, { prospectos: 1 }));
    const alertas = M.generarAlertas({ usuario, registros: regs, hoy: '2026-10-12', metas: [meta('prospectos', 'semanal', 10)] });
    const semanal = alertas.find((a) => a.tipo === 'indicador' && a.periodoTipo === 'semana');
    expect(semanal).toMatchObject({ severidad: 'critica', realizado: 5, esperado: 10 });
  });

  it('un comercial inactivo no genera alertas', () => {
    expect(M.generarAlertas({ usuario: { ...USUARIO, activo: false }, metas: [], registros: [], hoy: '2026-10-08' })).toEqual([]);
  });
});

describe('Índice de cumplimiento', () => {
  it('promedia los indicadores evaluados y topa cada uno en 100 %', () => {
    const metas = [meta('prospectos', 'semanal', 10), meta('propuestas', 'semanal', 10)];
    // miércoles: esperado 4 en cada uno; prospectos 8 (200 % → 100), propuestas 2 (50 %)
    const regs = [registro('2026-10-05', { prospectos: 8, propuestas: 2 })];
    const ev = evaluar(metas, regs, 'semana', '2026-10-07', '2026-10-07');
    expect(M.indiceCumplimiento(ev)).toBe(75);
  });

  it('es null cuando no hay nada evaluado', () => {
    expect(M.indiceCumplimiento(evaluar([meta('prospectos', 'semanal', 10)], [], 'semana', '2026-10-05', '2026-10-05'))).toBeNull();
    expect(M.indiceCumplimiento(evaluar([], [], 'semana', '2026-10-05', '2026-10-08'))).toBeNull();
  });
});

describe('Consolidado del equipo', () => {
  const evA = evaluar([meta('prospectos', 'semanal', 10), meta('tasa_aceptacion', 'umbral', 30)],
    [registro('2026-10-05', { prospectos: 4, invitaciones: 50, conexiones: 10 })], 'semana', '2026-10-07', '2026-10-07');
  const evB = evaluar([meta('prospectos', 'semanal', 5), meta('tasa_aceptacion', 'umbral', 40)],
    [registro('2026-10-05', { prospectos: 1, invitaciones: 50, conexiones: 20 })], 'semana', '2026-10-07', '2026-10-07');
  const evC = evaluar([], [registro('2026-10-05', { prospectos: 7 })], 'semana', '2026-10-07', '2026-10-07');

  it('suma metas, esperados y realizados', () => {
    const p = M.consolidarEquipo([evA, evB])!.indicadores.find((i) => i.id === 'prospectos')!;
    expect(p.meta).toBe(15);
    expect(p.esperado).toBe(6);
    expect(p.realizado).toBe(5);
    expect(p.cumplimientoEsperado).toBeCloseTo(83.3333, 3);
    expect(p.estado).toBe('amarillo');
  });

  it('lo realizado por quien no tiene meta no infla el cumplimiento', () => {
    const p = M.consolidarEquipo([evA, evB, evC])!.indicadores.find((i) => i.id === 'prospectos')!;
    expect(p.realizado).toBe(12);
    expect(p.cumplimientoEsperado).toBeCloseTo(83.3333, 3);
  });

  it('recalcula los ratios con sumas y promedia el umbral', () => {
    const r = M.consolidarEquipo([evA, evB])!.ratios.find((x) => x.id === 'tasa_aceptacion')!;
    expect(r.valor).toBe(30);
    expect(r.umbral).toBe(35);
    expect(r.estado).toBe('amarillo');
  });

  it('sin evaluaciones devuelve null', () => {
    expect(M.consolidarEquipo([])).toBeNull();
  });
});

describe('Histórico por rango', () => {
  it('divide un rango recortando los periodos de los extremos', () => {
    expect(F.dividirRango('semana', '2026-10-07', '2026-10-20').map((p) => `${p.ini}/${p.fin}`))
      .toEqual(['2026-10-07/2026-10-11', '2026-10-12/2026-10-18', '2026-10-19/2026-10-20']);
    expect(F.dividirRango('mes', '2026-09-15', '2026-11-02').map((p) => `${p.ini}/${p.fin}`))
      .toEqual(['2026-09-15/2026-09-30', '2026-10-01/2026-10-31', '2026-11-01/2026-11-02']);
    expect(F.dividirRango('dia', '2026-10-09', '2026-10-11')).toHaveLength(3);
  });

  it('los tramos suman exactamente el resumen del rango', () => {
    const metas = [meta('prospectos', 'semanal', 10)];
    const regs = ['2026-09-21', '2026-09-30', '2026-10-02', '2026-10-06'].map((f) => registro(f, { prospectos: 3 }));
    const h = M.evaluarHistorico({ usuario: USUARIO, metas, registros: regs, hoy: '2026-10-20', agrupacion: 'semana', ini: '2026-09-16', fin: '2026-10-07' });
    const total = h.resumen.indicadores.find((i) => i.id === 'prospectos')!;
    const tramos = h.tramos.map((t) => t.indicadores.find((i) => i.id === 'prospectos')!);
    expect(total.realizado).toBe(12);
    expect(tramos.reduce((s, t) => s + t.realizado, 0)).toBe(12);
    // 16–18 sep: 3 días de una semana de 5 → 6; dos semanas completas → 20; 5–7 oct: 3 días → 6
    expect(total.meta).toBe(32);
    expect(tramos.reduce((s, t) => s + (t.meta ?? 0), 0)).toBeCloseTo(32, 6);
  });

  it('los días exigibles cuentan desde la fecha de inicio del comercial', () => {
    const usuario = { ...USUARIO, fechaInicio: '2026-10-05' };
    const regs = [registro('2026-10-05', {}), registro('2026-10-07', {})];
    const ev = M.evaluarPeriodo({ usuario, metas: [], registros: regs, tipo: 'mes', periodo: F.periodo('mes', '2026-10-01'), hoy: '2026-10-09' });
    expect(ev.diasHabilesTranscurridos).toBe(6); // 1, 2, 5, 6, 7, 8 oct
    expect(ev.diasHabilesExigibles).toBe(4); // 5, 6, 7, 8 oct
    expect(ev.diasRegistrados).toBe(2);
    expect(ev.diasSinRegistro).toEqual(['2026-10-06', '2026-10-08']);
  });

  it('un año calendario se evalúa como año, con un tramo por mes', () => {
    const h = M.evaluarHistorico({ usuario: USUARIO, metas: [meta('oportunidades', 'mensual', 3, '2026-01-01')], registros: [], hoy: '2027-01-15', agrupacion: 'mes', ini: '2026-01-01', fin: '2026-12-31' });
    expect(h.resumen.tipo).toBe('anio');
    expect(h.tramos).toHaveLength(12);
    expect(h.resumen.indicadores.find((i) => i.id === 'oportunidades')!.meta).toBe(36);
  });

  it('consolida históricos de varios comerciales tramo a tramo', () => {
    const a = M.evaluarHistorico({ usuario: USUARIO, metas: [], registros: [registro('2026-10-05', { invitaciones: 4 })], hoy: '2026-10-20', agrupacion: 'semana', ini: '2026-10-05', fin: '2026-10-18' });
    const b = M.evaluarHistorico({ usuario: USUARIO, metas: [], registros: [registro('2026-10-13', { invitaciones: 6 })], hoy: '2026-10-20', agrupacion: 'semana', ini: '2026-10-05', fin: '2026-10-18' });
    const eq = M.consolidarHistoricos([a, b])!;
    expect(eq.tramos.map((t) => t.indicadores.find((i) => i.id === 'invitaciones')!.realizado)).toEqual([4, 6]);
    expect(eq.resumen.indicadores.find((i) => i.id === 'invitaciones')!.realizado).toBe(10);
  });
});

describe('Series para tendencias', () => {
  it('lista los últimos periodos del más antiguo al más reciente', () => {
    expect(F.periodosHasta('semana', '2026-10-07', 3).map((p) => p.ini)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(F.periodosHasta('mes', '2026-10-07', 3).map((p) => p.ini)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    // días: solo hábiles (12 oct es festivo; 10 y 11 son fin de semana)
    expect(F.periodosHasta('dia', '2026-10-13', 3).map((p) => p.ini)).toEqual(['2026-10-08', '2026-10-09', '2026-10-13']);
  });

  it('evalúa cada periodo con la meta vigente en él', () => {
    const metas = [meta('invitaciones', 'diaria', 20, '2026-09-01', '2026-10-04'), meta('invitaciones', 'diaria', 30, '2026-10-05')];
    const serie = M.evaluarSerie({ usuario: USUARIO, metas, registros: [], hoy: '2026-10-08', tipo: 'semana', fecha: '2026-10-08', n: 2 });
    expect(serie.map((e) => e.indicadores.find((i) => i.id === 'invitaciones')!.meta)).toEqual([100, 150]);
  });
});
