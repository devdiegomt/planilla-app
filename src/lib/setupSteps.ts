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
  /**
   * Cuántos grados tienen los pesos de SU matriz, traídos de la plataforma.
   *
   * No es un "ya lo hice" que el docente marque: sale de que
   * `SubjectConfig.slots` exista, o sea de que la matriz llegó de verdad. Un
   * paso que solo se puede marcar a mano no dice nada sobre el estado de la
   * app; este sí.
   */
  gradosConMatriz: number;
}

export interface SetupStep {
  id: 'califica' | 'anio' | 'materias' | 'horario' | 'codigos' | 'matriz';
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
      href: '/#califica',
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
      href: '/ajustes/materias',
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
      /*
       * El paso que a Diego no le hacía falta y a cualquier otro docente sí.
       *
       * Sin la matriz propia, la app calcula las definitivas con los pesos de
       * Informática — que son los únicos que trae fijos. Para Diego dan bien
       * porque son los suyos; para otro profesor darían mal **en silencio**, y
       * ese es el peor error que puede tener esta app. De la matriz sale además
       * qué ciclos llevan nota y cuáles son formativos.
       */
      id: 'matriz',
      titulo: 'Trae tu matriz de actividades',
      porque: 'Cuánto pesa cada nota EN TU MATERIA y en qué ciclo cae. Sin esto la '
        + 'app calcula con los pesos de otra asignatura, y las definitivas te '
        + 'darían distinto sin que nada lo avise.',
      href: '/plataforma',
      done: hayCursos && s.gradosConMatriz > 0,
      bloqueadoPor: hayCursos ? undefined : 'califica',
    },
    {
      id: 'codigos',
      titulo: 'Confirma los códigos de tus estudiantes',
      porque: 'Son lo que la plataforma usa para identificarlos al subir notas y '
        + 'asistencia. Vienen en el Califica, así que este paso suele marcarse solo.',
      href: '/#califica',
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
