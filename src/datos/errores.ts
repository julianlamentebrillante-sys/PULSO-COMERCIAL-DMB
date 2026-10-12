/** Error de una regla de negocio: su mensaje está pensado para mostrarse al usuario. */
export class ErrorNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorNegocio';
  }
}

export function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorNegocio(mensaje);
}
