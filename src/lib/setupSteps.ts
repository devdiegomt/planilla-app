/**
 * Los pasos para dejar la app lista, en orden de dependencia.
 *
 * El estado vacío decía solo "Sube tu Planilla para empezar", pero el orden
 * real son cinco pasos en cuatro pantallas distintas y nada los enumeraba:
 * Diego los sabe de memoria, un colega no.
 *
 * El primer paso es el Califica y no la Planilla del año: la Planilla la
 * exporta un solo docente, mientras que el Califica lo baja cualquiera — y
 * además trae los códigos, que la Planilla no.
 *
 * La lógica vive acá y no en el componente para poder probarla sin navegador,
 * y porque de ella depende que la lista no le quede colgada a quien ya terminó.
 */

export interface SetupState {
  cursos: number;
  tieneAnio: boolean;
  /** Derivado de los grados del docente: si hay cursos, no puede estar vacío
   *  salvo que todas las materias estén configuradas. */
  gradosSinMateria: number[];
  bloquesHorario: number;
  estudiantes: number;
  estudiantesConCodigo: number;
}

export interface SetupStep {
  id: 'califica' | 'anio' | 'materias' | 'horario' | 'codigos';
  titulo: string;
  /** Qué desbloquea. Sin esto la lista es una orden sin motivo. */
  porque: string;
  href: string;
  done: boolean;
  /** Paso que hay que hacer antes. Se muestra en gris, no como pendiente. */
  bloqueadoPor?: SetupStep['id'];
}

export function setupSteps(s: SetupState): SetupStep[] {
  const hayCursos = s.cursos > 0;
  return [
    {
      id: 'califica',
      titulo: 'Importa tu Califica',
      porque: 'El archivo que bajas de la plataforma. De ahí salen tus cursos, tus '
        + 'estudiantes y sus códigos, todo de una. Lo demás depende de esto.',
      href: '/',
      done: hayCursos,
    },
    {
      id: 'anio',
      titulo: 'Define el año lectivo',
      porque: 'La fecha de inicio y el primer día de la rotación. Sin eso no hay ciclos ni asistencia.',
      href: '/calendario',
      done: s.tieneAnio,
    },
    {
      id: 'materias',
      titulo: 'Configura tus materias',
      porque: 'El Califica y la asistencia llevan el nombre y el código de la asignatura.',
      href: '/ajustes',
      done: hayCursos && s.gradosSinMateria.length === 0,
      bloqueadoPor: hayCursos ? undefined : 'califica',
    },
    {
      id: 'horario',
      titulo: 'Arma tu horario',
      porque: 'Qué dictas en cada tipo de día. Es lo que arma "Clases de hoy".',
      href: '/horario',
      done: s.bloquesHorario > 0,
      bloqueadoPor: hayCursos ? undefined : 'califica',
    },
    {
      id: 'codigos',
      titulo: 'Confirma los códigos de tus estudiantes',
      porque: 'Son lo que la plataforma usa para identificarlos al subir notas y '
        + 'asistencia. Vienen en el Califica, así que este paso suele marcarse solo.',
      href: '/',
      done: s.estudiantes > 0 && s.estudiantesConCodigo > 0,
      bloqueadoPor: hayCursos ? undefined : 'califica',
    },
  ];
}

/** Los que faltan y ya se pueden hacer. */
export function pasosPendientes(steps: SetupStep[]): SetupStep[] {
  return steps.filter(p => !p.done && !p.bloqueadoPor);
}

/** ¿Ya está todo listo? Entonces la lista no se muestra. */
export function setupCompleto(steps: SetupStep[]): boolean {
  return steps.every(p => p.done);
}
