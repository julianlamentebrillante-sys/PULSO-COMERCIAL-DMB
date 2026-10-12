/**
 * Muestra un código de acceso recién generado, con el mensaje listo para
 * enviárselo a la persona. El código solo se ve esta vez: no se puede recuperar.
 */
import { useState } from 'react';
import * as F from '../core/fechas';
import { Aviso, Modal } from './componentes';

export interface CodigoGenerado {
  tipo: 'activacion' | 'restablecer';
  nombre: string;
  correo: string;
  codigo: string;
}

const DIAS_VIGENCIA = 7;

function mensaje({ tipo, nombre, correo, codigo }: CodigoGenerado, url: string, vence: string): string {
  const primerNombre = nombre.trim().split(/\s+/)[0];
  return tipo === 'activacion'
    ? `Hola ${primerNombre}, ya tienes acceso a PULSO COMERCIAL DMB.\n\n`
      + `1. Entra a ${url}\n`
      + `2. Haz clic en «Activar mi cuenta».\n`
      + `3. Escribe tu correo (${correo}) y este código: ${codigo}\n`
      + `4. Crea tu contraseña (mínimo 8 caracteres).\n\n`
      + `El código sirve una sola vez y vence el ${vence}.`
    : `Hola ${primerNombre}, este es tu código para crear una contraseña nueva en PULSO COMERCIAL DMB.\n\n`
      + `1. Entra a ${url}\n`
      + `2. Haz clic en «Olvidé mi contraseña».\n`
      + `3. Escribe tu correo (${correo}) y este código: ${codigo}\n`
      + `4. Crea tu nueva contraseña (mínimo 8 caracteres).\n\n`
      + `El código sirve una sola vez y vence el ${vence}.`;
}

export function ModalCodigo({ datos, onCerrar }: { datos: CodigoGenerado; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const vence = F.formatoLargo(F.sumarDias(F.hoyBogota(), DIAS_VIGENCIA)).toLowerCase();
  const texto = mensaje(datos, window.location.origin, vence);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <Modal titulo={datos.tipo === 'activacion' ? `Acceso autorizado · ${datos.nombre}` : `Código para restablecer · ${datos.nombre}`} onCerrar={onCerrar}>
      <p>Código de {datos.tipo === 'activacion' ? 'activación' : 'restablecimiento'}:</p>
      <p className="codigo-acceso" aria-label={`Código ${datos.codigo.split('').join(' ')}`}>{datos.codigo}</p>
      <Aviso tipo="atencion">Copia o envía el mensaje ahora: por seguridad, este código no se vuelve a mostrar. Si se pierde, genera uno nuevo.</Aviso>
      <label className="campo">
        <span className="campo__titulo">Mensaje para {datos.nombre.trim().split(/\s+/)[0]}</span>
        <textarea className="mensaje-acceso" readOnly value={texto} rows={9} onFocus={(e) => e.target.select()} />
      </label>
      <div className="acciones">
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
        <button type="button" className="btn btn--primario" onClick={copiar}>{copiado ? '✓ Mensaje copiado' : 'Copiar mensaje'}</button>
      </div>
    </Modal>
  );
}
