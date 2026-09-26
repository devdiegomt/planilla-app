'use client';

import { useEffect } from 'react';
import { seguirAlSistema } from '@/lib/tema';

/**
 * Mantiene el tema al día mientras la app está abierta.
 *
 * El tema se resuelve una vez, en el guion del `<head>`. Sin este vigía, quien
 * eligió "como el sistema" se queda con el tema que tenía al abrir: el celular
 * pasa a oscuro al atardecer y la app sigue blanca hasta que se recarga. Va en
 * el layout y no en la pantalla de configuración porque el cambio puede pasar
 * en cualquier pantalla.
 */
export function TemaVivo() {
  useEffect(() => seguirAlSistema(), []);
  return null;
}
