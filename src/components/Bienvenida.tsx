'use client';

import { ImportCalifica451 } from './ImportCalifica451';

/**
 * Lo que ve alguien que abre la app por primera vez.
 *
 * Antes veía el inicio completo con todo vacío: pendientes sin pendientes,
 * cursos sin cursos, un botón de EFAS que no puede generar nada y otro de
 * asistencia que no tiene a quién marcar. Siete secciones que no hacen nada,
 * y el único camino de entrada perdido al final de la página.
 *
 * Acá hay **una sola cosa que hacer**, y está en la pantalla, no detrás de un
 * enlace. Todo lo demás aparece cuando ya existe un curso: la app se llena
 * sola a medida que sirve para algo.
 */
export function Bienvenida() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Tus notas y tu asistencia, sin repetir trabajo</h1>
        <p className="text-tinta-suave">
          Llevas las notas y la asistencia acá, y la app te devuelve los archivos que la
          plataforma del colegio espera. Funciona sin internet y los datos se quedan en
          tu equipo.
        </p>
      </header>

      <section id="califica" className="tarjeta p-4 space-y-3">
        <div>
          <h2 className="font-medium">Empieza por tu Califica</h2>
          <p className="text-sm text-tinta-suave mt-1">
            Es el archivo que bajas de la plataforma en{' '}
            <span className="font-medium">Importar/exportar planillas por profesor</span>.
            De ahí salen tus cursos, tus estudiantes y sus códigos, todo de una: no hay
            que escribir a nadie a mano.
          </p>
        </div>
        <ImportCalifica451 />
      </section>

      {/*
        * Decirlo acá y no esperar a que lo descubra: arriba hay un botón de
        * "Iniciar sesión", y quien lo ve da por hecho que hay que registrarse
        * antes de empezar. Ninguna pantalla lo exige —la cuenta es solo para
        * sincronizar—, pero eso no se ve por ningún lado, y creerlo es
        * suficiente para no pasar del primer minuto.
        */}
      <p className="text-[13px] text-tinta-suave">
        No necesitas cuenta para empezar: todo esto funciona en tu equipo, sin
        internet. La cuenta sirve después, para tener lo mismo en el celular y
        en el computador.
      </p>

      <section className="panel p-4">
        <h2 className="font-medium text-sm">Y después</h2>
        <ol className="mt-2 space-y-1.5 text-sm text-tinta-suave list-decimal list-inside">
          <li>Dices cuándo empieza el año, para que la app sepa los ciclos.</li>
          <li>Dices qué materia dictas en cada grado.</li>
          <li>Armas tu horario, y con eso sabe qué clases tienes hoy.</li>
          <li>Arrastras los botones que hablan con la plataforma.</li>
        </ol>
        <p className="text-[12px] text-tinta-tenue mt-2">
          La app te va marcando cuáles faltan; no hay que acordarse.
        </p>
      </section>
    </div>
  );
}
