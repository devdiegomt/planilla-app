/**
 * Festivos oficiales de Colombia.
 *
 * Combina festivos fijos + festivos móviles derivados de Pascua (Meeus/Butcher)
 * y aplica Ley Emiliani: los festivos marcados se corren al siguiente lunes.
 */

/** Fecha de Pascua (domingo) según algoritmo anónimo Gregoriano. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Corre una fecha al siguiente lunes (o la deja si ya es lunes). */
function toNextMonday(d: Date): Date {
  const wd = d.getUTCDay();               // 0 dom .. 6 sáb
  if (wd === 1) return d;
  const offset = (8 - wd) % 7;            // días hasta el próximo lunes
  return addDays(d, offset === 0 ? 7 : offset);
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface Holiday {
  date: string;                            // 'YYYY-MM-DD'
  name: string;
}

/**
 * Devuelve todos los festivos oficiales del año en Colombia.
 * Aplica Ley Emiliani a los que corresponde.
 */
export function holidaysForYear(year: number): Holiday[] {
  const easter = easterSunday(year);

  // { fecha base (UTC), nombre, moverALunes? }
  const spec: { d: Date; name: string; move: boolean }[] = [
    { d: new Date(Date.UTC(year, 0, 1)),  name: 'Año Nuevo',                move: false },
    { d: new Date(Date.UTC(year, 0, 6)),  name: 'Reyes Magos',              move: true  },
    { d: new Date(Date.UTC(year, 2, 19)), name: 'San José',                 move: true  },
    { d: addDays(easter, -3),             name: 'Jueves Santo',             move: false },
    { d: addDays(easter, -2),             name: 'Viernes Santo',            move: false },
    { d: new Date(Date.UTC(year, 4, 1)),  name: 'Día del Trabajo',          move: false },
    { d: addDays(easter, 39),             name: 'Ascensión del Señor',      move: true  },
    { d: addDays(easter, 60),             name: 'Corpus Christi',           move: true  },
    { d: addDays(easter, 68),             name: 'Sagrado Corazón',          move: true  },
    { d: new Date(Date.UTC(year, 5, 29)), name: 'San Pedro y San Pablo',    move: true  },
    { d: new Date(Date.UTC(year, 6, 20)), name: 'Independencia',            move: false },
    { d: new Date(Date.UTC(year, 7, 7)),  name: 'Batalla de Boyacá',        move: false },
    { d: new Date(Date.UTC(year, 7, 15)), name: 'Asunción de la Virgen',    move: true  },
    { d: new Date(Date.UTC(year, 9, 12)), name: 'Día de la Raza',           move: true  },
    { d: new Date(Date.UTC(year, 10, 1)), name: 'Todos los Santos',         move: true  },
    { d: new Date(Date.UTC(year, 10, 11)),name: 'Independencia de Cartagena', move: true },
    { d: new Date(Date.UTC(year, 11, 8)), name: 'Inmaculada Concepción',    move: false },
    { d: new Date(Date.UTC(year, 11, 25)),name: 'Navidad',                  move: false },
  ];

  return spec.map(s => ({
    date: iso(s.move ? toNextMonday(s.d) : s.d),
    name: s.name,
  }));
}
