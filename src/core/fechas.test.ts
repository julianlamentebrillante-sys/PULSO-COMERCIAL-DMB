import { describe, expect, it } from 'vitest';
import * as F from './fechas';

describe('Festivos de Colombia', () => {
  it('calcula los 18 festivos de 2026', () => {
    expect(F.festivosColombia(2026).lista.map((x) => x.fecha)).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
      '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07',
      '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
    ]);
  });

  it('calcula los festivos móviles de 2025 (incluye dos festivos el mismo lunes)', () => {
    const fechas = F.festivosColombia(2025).lista.map((x) => x.fecha);
    for (const f of ['2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18', '2025-06-02', '2025-06-23',
      '2025-06-30', '2025-08-18', '2025-10-13', '2025-11-03', '2025-11-17']) {
      expect(fechas).toContain(f);
    }
    expect(fechas).toHaveLength(17);
    expect(F.nombreFestivo('2025-06-30')).toContain('/');
  });

  it('calcula el domingo de Pascua', () => {
    expect(F.domingoPascua(2025)).toBe('2025-04-20');
    expect(F.domingoPascua(2026)).toBe('2026-04-05');
    expect(F.domingoPascua(2027)).toBe('2027-03-28');
  });
});

describe('Días hábiles', () => {
  it('excluye sábados, domingos y festivos', () => {
    expect(F.esHabil('2026-10-05')).toBe(true); // lunes
    expect(F.esHabil('2026-10-10')).toBe(false); // sábado
    expect(F.esHabil('2026-10-11')).toBe(false); // domingo
    expect(F.esHabil('2026-10-12')).toBe(false); // festivo
    expect(F.motivoNoHabil('2026-10-12')).toBe('festivo: Día de la Raza');
    expect(F.motivoNoHabil('2026-10-10')).toBe('fin de semana');
  });

  it('cuenta días hábiles de un mes y de semanas con y sin festivo', () => {
    expect(F.contarDiasHabiles('2026-10-01', '2026-10-31')).toBe(21);
    expect(F.contarDiasHabiles('2026-10-05', '2026-10-11')).toBe(5);
    expect(F.contarDiasHabiles('2026-10-12', '2026-10-18')).toBe(4);
  });

  it('encuentra el último día hábil anterior', () => {
    expect(F.ultimoDiaHabilHasta('2026-10-12')).toBe('2026-10-09');
    expect(F.ultimoDiaHabilHasta('2026-10-07')).toBe('2026-10-07');
  });
});

describe('Periodos', () => {
  it('la semana va de lunes a domingo', () => {
    expect(F.periodo('semana', '2026-10-11')).toEqual({ tipo: 'semana', ini: '2026-10-05', fin: '2026-10-11' });
    expect(F.periodo('semana', '2026-10-05')).toEqual({ tipo: 'semana', ini: '2026-10-05', fin: '2026-10-11' });
  });

  it('calcula fin de mes, incluso en años bisiestos', () => {
    expect(F.finMes('2026-02-10')).toBe('2026-02-28');
    expect(F.finMes('2028-02-10')).toBe('2028-02-29');
    expect(F.periodo('anio', '2026-06-01')).toEqual({ tipo: 'anio', ini: '2026-01-01', fin: '2026-12-31' });
  });

  it('valida fechas', () => {
    expect(F.esFechaValida('2026-02-28')).toBe(true);
    expect(F.esFechaValida('2026-02-30')).toBe(false);
    expect(F.esFechaValida('05/10/2026')).toBe(false);
  });
});
