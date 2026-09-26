# planilla-app — contexto para Claude

App de Diego Mayorga, docente de informática del Colegio GLA (Colombia), para sus
19 cursos de 8° a 11° (801–806, 901–905, 1001–1004, 1101–1104; ~540 estudiantes).
Next.js 15 (App Router) + Dexie (IndexedDB, local-first) + Supabase (auth OTP y sync)
+ Vercel (deploy, crons, push VAPID). Producción: https://planillaapp.vercel.app

Repo hermano: **planilla-v2** (`devdiegomt/planilla-v2`), userscripts sobre la
plataforma del colegio (Classroom Live). Ver "Integraciones".

## Comandos

- `npm run dev` — servidor de desarrollo
- `npx tsc --noEmit` — typecheck, la puerta obligatoria. No hay runner de tests ni ESLint.
- Deploy: merge a `main` → Vercel.

## Cómo trabajar con Diego

- Chat, UI y comentarios en español; identificadores en inglés.
- **La UI habla de tú** ("Importa tu Planilla", "Revisa antes de subir"), no de vos.
  Los READMEs de planilla-v2 usan voseo; la app no.
- **La UI no nombra la implementación.** Se conserva el vocabulario del colegio
  (Planilla, Califica, EFAS, ciclo, D1–D5, F/R) y se evita el del código: nada de
  Supabase, VAPID, JSON de tal script, COD_ALUM, tablas ni rutas de URL como texto.
  En pantalla es "el código del estudiante", "el servidor", "la copia".
- Alcance pequeño y entregable; proponer una opción recomendada en vez de muchas
  preguntas. Para funciones grandes, plan corto antes de programar.
- Git: nunca commitear sin que lo pida. Cuando lo pide: rama nueva desde `main`
  actualizado (`fix/…`, `feat/…`), commit en español, push, y Diego abre y mergea
  el PR. No empujar directo a `main`.
- Él prueba en Vercel después del merge; no hace falta probar cada ruta en navegador
  si el typecheck y las pruebas de lógica pasan.
- **Datos de estudiantes (menores de edad):** nunca commitear archivos reales (Califica,
  Planilla, JSON con nombres o códigos) ni dejarlos en `public/`. Si Diego adjunta uno
  para probar, se usa fuera del repo y no se sube.
- Pruebas en navegador con datos sintéticos en IndexedDB: **borrarlos siempre al
  terminar**. Nunca dejar filas de prueba en su base.
- Pruebas de lógica sin navegador: transpilar los `.ts` de `src/lib` con `typescript`
  (`transpileModule` a CommonJS) en una carpeta temporal fuera del repo y ejecutarlos
  con Node contra los archivos reales o sintéticos.
- Secretos solo en servidor: nunca con prefijo `NEXT_PUBLIC_`. Diego configura él mismo
  Vercel, Supabase, Resend y Google Cloud; darle pasos exactos.

## Dominio del colegio

- **Notas:** `0` = sin calificar (el algoritmo de la plataforma lo ignora); `30` =
  `NOTA_MIN`, la mínima real. Aprobación 70, experto 80, máximo 100.
- **Categorías K/M/U/C/E**, cada una 20 % de la definitiva. E es la evaluación
  trimestral (columna C7). Pesos internos en `SLOTS_8_10` y `SLOTS_11` (`lib/constants.ts`).
- **Fórmula "platform"** (la de la app): promedio ponderado por categoría ignorando
  ceros, definitiva = promedio de categorías > 0, redondeo half-up. Validada contra la
  plataforma; no cambiarla sin volver a validar.
- **Días:** rotación D1–D5 de lunes a jueves; el viernes es Día Fijo. Festivos
  (Colombia) y cancelaciones no consumen rotación.
- `cod_mat` depende del grado: 2508, 2509, 2510 y **3011** para 11°. Ya no es una
  constante: vive en `YearConfig.subjects` y se edita en /ajustes → "Mis materias".

## Invariantes que ya costaron bugs

- **Relaciones por `courseCode` / `studentSyncId`, nunca por `courseId` / `studentId`.**
  Los ids de Dexie son locales y `stripLocalMeta` los borra antes de subir; del lado
  del servidor comparar `courseId` da `undefined === undefined`.
- **syncId deterministas** (`lib/syncId.ts`): el mismo curso o estudiante produce el
  mismo UUID en cualquier dispositivo. Reimportar no debe duplicar.
- **La identidad de un estudiante es su COD_ALUM, no su nombre.** `studentSyncIdByCode`
  para las filas nuevas; `studentSyncId` (por nombre) queda para las que ya existen, que
  no pueden cambiar de clave sin volverse huérfanas. El emparejamiento al importar vive en
  `lib/studentMatch.ts`, puro y aparte de Dexie: primero por código, y por nombre solo si
  no hay. `normalizeName` ya absorbe tildes y mayúsculas; lo que el nombre NO aguanta es
  un apellido añadido o corregido, y ahí el código es lo único que sostiene la identidad.
- **Migraciones Dexie:** nunca modificar una versión existente. Siempre una versión
  nueva que repita todos los stores.
- **Borrar una fila sincronizable no la borra del servidor.** El hook `deleting`
  encola una lápida, que al subir deja la MISMA fila marcada `deleted_at`. Podar en
  local con lápidas cambia filas por lápidas sin liberar nada: para liberar de verdad
  hay que borrar del lado del servidor (ver `pruneRemoteChangeLog`). Cuando el borrado
  significa "este dispositivo ya no lo guarda" y no "esto se borró en todas partes",
  va con `withoutTombstone`.
- **`changeLog` se poda; las notas y lo archivado no.** Retención en `lib/retention.ts`:
  180 días, en local al arrancar (una vez al día) y en el servidor desde el cron de la
  tarde. `trimesterSnapshots` no se toca nunca.
- **Tabla sincronizable nueva** = registrarla en tres lugares: `SYNCABLE` (hooks en
  `lib/db.ts`), `SYNCABLE_TABLES` (`lib/sync.ts`) y `TABLES` (`lib/backup.ts`). Si el dato
  cabe como campo opcional de una tabla que ya sincroniza, sale más barato: el sync sube
  la fila entera como JSON, así que un campo no indexado no necesita migración ni tocar
  Supabase (así se agregaron `ScheduleBlock.kind` y `YearConfig.subjects`).
- **Los pesos de las subnotas ya no se suponen** (`lib/actividades.ts`). `SLOTS_8_10` y
  `SLOTS_11` estaban fijos en el código y se habían validado solo de rebote, porque las
  definitivas que calculaba la app daban igual que las de la plataforma. Leídos de la
  matriz de actividades (pantalla 831) el 24/09/2026 resultaron **exactos** para los
  cuatro grados, y cada categoría suma 100 %. Que coincidan no los volvía correctos:
  son los de **una materia**, y otro docente habría calculado con los de informática sin
  enterarse. Ahora se traen con el `actividades-extractor` de planilla-v2 y viven en
  `SubjectConfig.slots`, campo opcional y no indexado dentro de `YearConfig`: sin
  migración y sin tocar Supabase. Los fijos quedan de respaldo.
  **El segundo parámetro de `slotsFor` es obligatorio a propósito.** Siendo opcional,
  cualquier pantalla que se olvidara de pasar las materias calculaba con los fijos en
  silencio, y dos pantallas mostrando definitivas distintas del mismo estudiante es el
  peor error que puede tener esta app; siendo obligatorio, el que no tiene de dónde
  sacarlas escribe `undefined` y se ve en el diff. `useSubjects` es el atajo en los
  componentes.
  `planActividades` arma un plan y no escribe, igual que `planPaste`. Lo que hay que ver
  antes no es un cruce de estudiantes sino si cambian las **columnas**: la clave de un
  slot (`K1_C4`) lleva su columna adentro, y de ahí salen la rejilla, el Califica y las
  subnotas ya guardadas. Cambiar un peso es inofensivo y viene marcado; cambiar una
  columna deja notas escritas sin dónde caer, así que se cuentan y hay que marcarlo a
  mano. Si dos cursos del mismo grado traen repartos distintos **no se elige uno**: se
  dice. Y el `cod_mat` de esa pantalla (1035, 2438, 1043, 1045) es **otro espacio de
  ids**, nada que ver con los 2508/2509/2510/3011 del Califica.

- **En qué ciclo va cada nota lo dice la matriz, no una pantalla aparte.**
  `SlotDef` ganó `ciclo` y `destino`, opcionales, que salen de la matriz de actividades.
  **Cada materia tiene su propia matriz** —los porcentajes NO son los mismos en todo el
  colegio— y de ahí sale cuántas notas hay por trimestre y en cuáles ciclos. Un ciclo
  sin ninguna actividad es **formativo**: se da clase y se pasa lista, pero no sale nota.
  `cyclesActive` existía en el tipo desde el principio y **nadie lo leía**; esto lo
  reemplaza sin preguntar nada, porque el dato ya venía en la matriz.
  **`ciclosConNota` devuelve `null`, no un conjunto vacío**, cuando ningún slot trae
  ciclo — que es el caso de quien no importó su matriz. Null es "no se sabe"; vacío
  sería "ninguno lleva nota", y con eso la app le diría a todo el mundo que sus nueve
  ciclos son formativos. Donde es null, no se muestra nada y la app se comporta como
  antes. Las constantes `SLOTS_*` no traen ciclo a propósito.

- **Llenar la matriz desde la app no puede inventar filas** (`lib/matriz.ts`). La
  pantalla 831 se edita fila por fila —"Editar" → "Actualizar", unas diez por curso y
  diecinueve cursos— y el formulario de `/matriz` la edita de una y saca un plan que el
  script de planilla-v2 aplica allá. Tres cosas que el diseño no puede soltar: **la app
  nunca inventa un id** (la fila de la plataforma lleva adentro el id de actividad, el
  del logro y su `cod_mat`; el script los lee de la fila y los devuelve tal cual, y solo
  viajan los cuatro campos editables); **se empareja por meta y posición, y se
  verifica** (el plan lleva lo que la app cree que hay hoy en cada fila, y si la
  pantalla no coincide esa fila no se escribe — la posición sola no es identidad, es el
  mismo problema que `planPaste`, y lo que la vuelve segura es comprobarla); y **nunca
  se crean filas** (la plataforma trae ocho casillas por categoría usadas o no, así que
  estrenar una actividad es llenar una que ya existe; por eso el extractor devuelve las
  vacías con su posición y no solo contadas). Por lo mismo hay que traer la matriz antes
  de editarla: la app no puede llenar una que no ha visto.

- **Nada del docente en constantes.** Los cursos, los grados y las materias salen de lo
  que el docente importó o configuró, no de `lib/constants.ts`. Ahí vivían `CURSOS_ORDER`,
  `DIRECTORES` y `GRADE_META`, y ataban la app a un solo profesor. Lo que queda atado son
  `SLOTS_8_10` y `SLOTS_11`.
- **El ciclo es de la rotación, no del curso** (`lib/cycles.ts`). Un ciclo es una vuelta
  D1→D5; el viernes (FIJO) no consume rotación y pertenece al ciclo en curso, así que un
  ciclo puede traer dos viernes. No asumir `grade === 11 ? 2 : 1` sesiones: usar
  `sessionDatesOf`. Verificado contra el cronograma real del colegio.
  **Y los ciclos se numeran 1..9 DENTRO de cada trimestre**, así que hay un ciclo 2 en
  cada uno: `sessionDatesOf` pide el trimestre y es obligatorio. Cuando
  `buildCourseCicloIndex` agrupaba solo por número, el ciclo 2 devolvía las clases de
  los tres trimestres juntas — un curso de 11° salía con seis clases entre febrero,
  mayo y agosto. No era cosmético: de esa lista sale `fechas[idxSesion]`, la fecha que
  exporta la asistencia, y de la fecha sale el **tipo de día** y con él la **hora** que
  se manda a la plataforma; además `nSesiones > 1` decide si las marcas viven en el
  ciclo o por sesión, así que con 6 en vez de 2 se leían de otro lado.
- **Las horas se numeran por dónde hay clase** (`lib/horarioGrid.ts`). Las filas se
  derivan agrupando bloques por inicio–fin, y `hourNumbers` cuenta las que tienen al
  menos una clase (`hasClass`). Numerar "toda fila que no sea descanso" se rompió dos
  veces: primero con una actividad dentro del descanso, después con un evento de horas
  propias que abría su propia fila — en ambos casos la fila se numeraba y corría todo lo
  que venía después (la 4ª pasaba a 5ª, la 7ª terminaba de 8ª). Contando por las clases
  no hay bloque agregado que pueda robarle el número a una hora.
- **Las franjas las definen las clases y los descansos, no los eventos.**
  `buildHorarioSlots` va en dos pases: primero las clases y los descansos crean las
  filas, y después cada evento cae en la franja con la que más se cruza
  (`overlapMinutes`), creando fila propia solo si no se cruza con ninguna. El chip
  muestra sus horas cuando no son las de la franja, para no hacer creer que empieza
  cuando empieza la hora.
- **El acompañamiento no dura todo el descanso: hay dos turnos.** La hora que los parte
  (`turnSplit`) es de la franja y va repetida en los seis bloques, como `title`; el turno
  (`turn`, 1 o 2) es de cada día. `turnRange` saca el rango real y devuelve null si el
  corte quedó fuera del descanso o en el borde, en vez de inventar un turno de cero. En
  el colegio: descanso 10:20–10:50 partido a las 10:35, almuerzo 13:15–14:10 partido a
  las 13:40 — los dos turnos no duran lo mismo, así que el corte se guarda y no se
  calcula.
- **El descanso es de la franja y se guarda por tipo de día**, con `title` y **una `note`
  propia por día**: el acompañamiento cambia de lugar según el día. Se edita desde el
  rótulo de la fila y cada día se dibuja en su celda (`BreakChip`). Dibujarlo por día no
  es cosmético: cuando `byDay` no lo incluía, apagar un día en el editor borraba su
  bloque pero la fila se veía idéntica, así que la opción parecía no hacer nada.
  `gapsBetween` detecta los ratos libres entre franjas y ofrece crear ahí la franja con
  las horas ya puestas.
- **Lo que se repite y lo que pasa una vez son cosas distintas** (`lib/dayAgenda.ts`).
  `ScheduleBlock` va por tipo de día y vuelve en cada vuelta D1→D5; `CalendarEvent` va
  por fecha, sale en su hora dentro del día y se vence solo. Una reunión de esta semana
  o un reemplazo NO son bloques del horario: puestos ahí quedarían para siempre y habría
  que acordarse de borrarlos. `dayAgenda` los mezcla para mostrar el día; `upcomingEvents`
  arma la lista de /horario. `CalendarEvent` ganó `startTime`, `endTime` y `endDate` como
  campos opcionales no indexados, así que no hizo falta migración ni tocar Supabase.
- **El próximo D2 no es el martes que viene.** El viernes es Fijo y no consume rotación,
  así que la vuelta se corre un día por semana (lun D1, mar D2… lun siguiente D5, mar D1,
  mié D2). Por eso `nextDateOfDayType` sale de `computeDayTypes` y no de sumar 7 días: es
  lo que deja crear algo temporal desde una celda del horario con la fecha ya puesta.
- **Un hijo de `grid` no se encoge solo: hay que darle `min-w-0`.** Trae
  `min-width: auto`, así que se niega a bajar del ancho mínimo de su contenido. Con
  filas que tienen partes que no ceden —la hora con ancho fijo, las insignias—, la
  tarjeta del día crecía más que la pantalla y **se llevaba la página entera**: en el
  celular el curso y las insignias quedaban fuera del borde derecho. Pasa en cualquier
  rejilla con contenido de ancho variable (`[&>*]:min-w-0` cubre todos los hijos de una
  vez). Verificado renderizando a 360px con Chromium headless: sin el arreglo no se ve
  ninguna insignia. **Le volvió a pasar al encabezado del curso**: una sola fila con
  `justify-between` y dos botones que no ceden ancho —"Generar Califica del curso 1102"
  no se parte en nada angosto— dejaba el botón 80px por fuera del borde y 116px de
  alto, montado sobre el título. Se arregla apilando en el celular
  (`flex-col sm:flex-row`), dejando envolver los botones y acortando la etiqueta: el
  número del curso ya está en el título. **El arnés engaña de dos maneras**: si el `.html` se copia a otra
  carpeta el `href` del CSS se rompe y se mide HTML sin estilos, y si no se reconstruye
  la hoja las clases nuevas no existen — en los dos casos la captura se ve plausible y
  es mentira.
- **La casilla de nota no puede ser `type="number"`** (`PlanillaGrid` + `lib/gridNav.ts`).
  Ahí las flechas suben y bajan el valor, y calificando lo que se quiere es bajar por la
  columna estudiante por estudiante; de paso la rueda del mouse cambiaba la nota al pasar
  por encima. Es `type="text"` con `inputMode="numeric"`, el teclado lo decide `nextCell`
  y las casillas se encuentran por `data-nota="fila-columna"` (con refs habría que rehacer
  la matriz en cada tecleo: guardar una nota redibuja la tabla entera). Izquierda y derecha
  solo cambian de columna con el cursor en la punta, para no robarle el paso al texto.
  El texto que se escribe vive en estado aparte del valor guardado, porque si no, borrar
  la casilla la volvía 0 en el acto; el efecto que los sincroniza no pisa lo escrito
  mientras la casilla tiene el foco.
- **Pegar notas de un Excel nunca se aplica de una** (`lib/pasteNotas.ts`). El
  portapapeles de Excel es texto plano (filas por salto de línea, celdas por tabulador),
  así que leerlo es fácil; lo delicado es a quién le toca cada nota. Una columna de puros
  números no tiene identidad: va por posición, y basta que el Excel esté ordenado distinto
  —otra alfabetización, un retirado, alguien que llegó después— para que todo lo que sigue
  caiga en el estudiante equivocado, en silencio. Por eso `planPaste` arma un plan y no
  escribe: si lo pegado trae códigos o nombres empareja por ahí (y el orden deja de
  importar), y si no, empareja por posición pero lo dice, y la vista previa lo muestra
  antes de aplicar. Una celda vacía significa "no toques esa nota", no 0. Las columnas se
  clasifican por mayoría y mirando si la celda ES un número, no si es una nota válida: con
  un umbral y con la validez mezclada, una columna con un 120 y un "N/A" dejaba de
  reconocerse como notas y la app respondía "no encontré notas".
- **Editar un bloque del horario no puede reenviar su `updatedAt`.** El hook `updating`
  respeta el que venga en el patch —lo necesita el pull, que trae el del servidor—, así
  que pasar la fila entera dejaba la fecha vieja y el push, que sube lo que tenga
  `updatedAt > lastPushed`, nunca se llevaba la edición. `upsertScheduleBlock` lo quita.
- **La rotación es continua:** `computeDayTypes` no la reinicia por trimestre. El primer
  día de cada trimestre se fuerza a D1 desde `/calendario`, y las semanas sin clase se
  marcan; si no, la numeración de ciclos se corre.
- **Asistencia:** banderas `F`/`Fj`/`R`/`Rj`. Si el ciclo trae varias clases del curso,
  marcas, razones y confirmación van por sesión. `arrived` no se exporta.
- **Cuántas veces se marca lista en un ciclo no lo decide el grado ni solo el horario**
  (`lib/sessions.ts`). "Dos si es 11°, una si no" era falso en las dos direcciones; el
  horario tampoco alcanza: un curso del Día Fijo trae dos clases SOLO en los ciclos
  donde caen dos viernes, una clase en bloque son dos franjas del mismo día donde se
  llama a lista una vez (eso ya sale bien, porque las sesiones se cuentan por fecha),
  y hay materias que ven al mismo curso cuatro veces por ciclo. El horario propone
  (`scheduledSessions`) y `Course.sessionsByCiclo` guarda **solo lo que el docente
  corrigió**, así que cambiar el horario sigue mandando en los ciclos que no tocó.
- **Las sesiones de un ciclo son un arreglo, no `S1`/`S2`.** `CycleData.sessions[]`, con
  `S1`/`S2` leídas como respaldo para no perder lo ya marcado (`sessionsOf`). El índice
  ES el número de sesión: `withSession` rellena los huecos, porque marcar la 3 sin haber
  tocado la 2 no puede dejar el arreglo corrido. `cycles` no es índice de Dexie, así que
  no hizo falta migración. La consolidación (`consolidate`) no es un OR: una falla en
  cualquier sesión es falla del ciclo, pero basta UNA sin justificar para que el ciclo
  cuente en contra.
- **Sesiones y fechas van en paralelo al exportar.** Si se marca menos veces que las
  clases que dice el horario, las que sobran quedan sin archivo a propósito: la
  plataforma registra por fecha y adivinar cuál era llevaría la asistencia al día
  equivocado.
- **Solo el dominio del colegio sincroniza.** `lib/allowedDomain.ts` avisa en el
  navegador; la puerta de verdad es la política de RLS
  (`supabase/migrations/004_dominio_institucional.sql`), porque un filtro de cliente se
  salta. El dominio se compara **completo y por la última arroba**, nunca con `like %`:
  `alguien@gla.edu.co.otrositio.com` no es del colegio. JS (`lastIndexOf('@')`) y SQL
  (`regexp_replace('^.*@','')`) leen el dominio igual, a propósito.
- **Restringir el correo NO saca los datos de ningún equipo.** La app es local-first: lo
  que hay en IndexedDB sigue ahí aunque se desactive la cuenta. Para eso está
  `wipeLocalData` (Ajustes → "Borrar los datos de este equipo"), que va con
  `withoutTombstone`: significa "este equipo ya no los guarda", no "bórralos de todos
  mis dispositivos".
- **Service worker:** no se registra en desarrollo. En producción va versionado por
  deploy y valida el tipo de lo que guarda. La guardia de arranque inline
  (`lib/recovery.ts`) repara sin tocar IndexedDB.
- **Un 403 o un 503 no hacen que `fetch` lance.** `navegar` solo caía al caché en el
  `catch`, así que un bloqueo de la plataforma se mostraba tal cual teniendo la copia
  guardada — lo peor de los dos mundos en una app local-first: los datos están en el
  dispositivo y aun así no abre. Ahora `fallaDelServidor` (403, 408, 429, 5xx) también
  sirve la copia. El 404 queda fuera a propósito: ahí la ruta de verdad no existe.

- **Las definitivas de trimestres pasados no las puede calcular la app** (`lib/historial.ts`).
  Sus notas son las del trimestre en curso: la plantilla se reemplaza cada trimestre y
  las anteriores no quedan. La plataforma sí las guarda, pero solo en
  `ConsCalificaDocentesGen` (24) y de a un curso y un periodo por vez — las planillas
  (1096, 1099) solo dan el periodo en curso. Las trae el `historial-extractor` de
  planilla-v2 y entran por `Student.platformHistory`, campo opcional y no indexado: sin
  migración ni tocar Supabase. Solo la **definitiva**; el desglose por categoría y la
  asistencia la app ya los tiene de primera mano y traerlos sería guardar dos veces lo
  mismo. **No son cuatro periodos: son tres y el final** (`01`, `02`, `03`, `05`; no
  existe el `04`). Para el trimestre en curso manda siempre la app, aunque lo importado
  traiga otro valor. El emparejamiento es **solo por código**, nunca por nombre: acá el
  archivo siempre trae el COD_ALUM, así que el respaldo por nombre que sí necesita la
  Planilla acá solo agregaría riesgo. Y `planHistorialImport` arma un plan y no escribe,
  igual que `planPaste`: lo que hay que ver antes no es un cruce de estudiantes —el
  código lo evita— sino que falte medio curso o que el archivo sea de otro año.
  El "va en" que se muestra es el promedio de los trimestres con nota, **no la
  definitiva del año**: esa la calcula el colegio y puede no ser un promedio simple.
  **El importador es relleno, no flujo normal:** `closeTrimester` ya archiva la
  definitiva en `trimesterSnapshots`, así que quien usa la app desde marzo no lo
  necesita nunca. `resumenDe` lee en ese orden — trimestre en curso de la app, los
  pasados del cierre propio, y lo importado solo rellena los que nunca se cerraron acá.
  Si el cierre y la plataforma difieren se muestran **los dos**: significa que ese
  Califica no llegó a subirse, y es justo lo que hay que ver en vez de elegir uno en
  silencio.

- **El EFAS de un trimestre pasado no sale de la planilla** (`lib/efasExporter.ts`).
  `buildEfasRows` ni siquiera recibía el trimestre: el selector solo cambiaba el título
  del archivo, así que elegir T1 generaba el T3 con el rótulo equivocado — peor que no
  dejar elegir. Las notas de la planilla son siempre las del trimestre en curso.
  Ahora cada definitiva sale de **`definitivaDe`** (`lib/historial.ts`), que es **la
  única regla de precedencia de la app** y por eso vive sola: la usan la línea
  `T1 · T2 · T3` de la pantalla del curso y el EFAS. Con dos copias, dos pantallas
  mostrarían números distintos del mismo estudiante.
  **`valor: null` no es 0.** Un estudiante sin nota de T1 no está perdiendo T1: es que
  ese trimestre no se cerró acá ni se importó. Quedan fuera de todas las cuentas y se
  cuentan aparte (`sinDato`); contarlos como 0 hundiría el promedio y el porcentaje de
  aprobación del curso con gente que nadie calificó mal. Si no hay ninguna nota del
  trimestre pedido, el export se detiene y lo dice.
  El total promedia **por estudiante y no por curso**: sumando definitivas y no
  promedios, un curso de 12 no pesa igual que uno de 30.

- **Preguntar en español no necesita un modelo de lenguaje** (`lib/consulta.ts`). El
  vocabulario del oficio es chico y cerrado —cursos, grados, notas, categorías, fallas,
  retardos, trimestres—, así que un intérprete de reglas cubre lo que se pregunta a
  diario y a cambio funciona sin red, sin costo, al instante y **sin que un solo nombre
  de estudiante salga del dispositivo**, que con menores es lo que decide si se puede
  usar. `interpretar` devuelve una consulta o **null**: lo que no entiende lo dice y
  ofrece ejemplos, nunca una aproximación — una respuesta plausible pero equivocada
  sobre las notas de alguien es peor que no responder. Al buscar por nombre empareja
  **por palabra y no por la frase entera** (exigir la frase falla apenas se cuela una
  palabra de relleno) y si coinciden varios **los muestra todos**: elegir entre dos
  apellidos iguales sería mostrar las notas del estudiante equivocado. Las fallas y los
  retardos se cuentan por ciclo, igual que `computeAttendanceStats`, para no tener dos
  números distintos de lo mismo según la pantalla.

- **El manual de convivencia se cita, no se resume** (`lib/manual.ts`). La respuesta es
  el artículo TEXTUAL con su ubicación (`Artículo 161 · Capítulo… · TÍTULO…`), nunca
  "hacé esto": un docente que actúa sobre un resumen equivocado de un debido proceso le
  hace daño al estudiante y expone al colegio, y un resumen plausible es indistinguible
  de uno correcto hasta que es tarde. Todo pasa en el dispositivo — el manual es un
  documento interno del colegio y subirlo a un tercero no es decisión de un docente
  suelto. **El manual real NUNCA entra al repo**; las pruebas usan un manual inventado
  que reproduce sus rarezas.
  Lo que el PDF deja y rompe todo en silencio: **2.591 palabras partidas con guion
  suave** (`\u00AD` al final de renglón). Sin unirlas, buscar "estudiante" pierde 117 de
  801 apariciones y "convivencia" 55 de 346 — y no falla ruidosamente, devuelve
  resultados, solo que no todos. También hay que descartar las líneas del índice (fila
  de puntos), los números de página sueltos y volver a armar los párrafos que el PDF
  cortó por ancho de columna, incluido el número de ítem que queda solo en su renglón.
  El artículo es la unidad (309 en el manual 2026, 307 parseados): es como se cita y
  como se busca.
  Al buscar, **cada término pesa por lo raro que es** (IDF): sin eso "estudiante" pesaba
  igual que "celular" y el artículo más largo —"Deberes de los Estudiantes"— ganaba
  siempre. Pero **la cobertura se cuenta, no se pondera**: ponderarla devolvía el
  reglamento del transporte por encima de "Principios del Debido Proceso", porque un
  término raro pesaba más que dos comunes juntos. Cuántos términos responde es una
  pregunta; cuánto importan es otra. Los sinónimos del colegio (bullying→acoso,
  copiar→fraude) se emparejan **quitando la terminación verbal**, no recortando a N
  letras: el español cambia la vocal al conjugar, así que "pego"/"pega" se separan en la
  cuarta letra y "copio"/"copia" en la quinta — no hay N que sirva para las dos.

## Califica (notas hacia la plataforma)

- **Flujo principal (home → "Califica de todos los cursos"):** Diego descarga en la
  plataforma *Importar/exportar planillas por profesor GLA* → Exportar un solo `.xls`
  (19 hojas `Sheet1…Sheet19`, en desorden, una por curso). La app escribe los COD_ALUM,
  guarda los encabezados del trimestre por grado y devuelve **el mismo archivo** (.xls
  BIFF8, SheetJS) con las notas escritas por COD_ALUM (`lib/califica451.ts`). Diego lo
  importa en esa misma pantalla; confirmado que la plataforma lo acepta.
- **Ese archivo es también el punto de partida.** Si un curso no existe, se crea con sus
  estudiantes desde la hoja (`courseFromCalificaSheet`). Es lo que permite que lo use un
  docente que no exporta la Planilla del año — o sea, todos menos Diego. Comparado con la
  Planilla, al Califica solo le faltan la asistencia histórica, las observaciones por
  ciclo y el director de grupo; y a cambio **trae el COD_ALUM, que la Planilla no**, así
  que arrancar por acá se ahorra el extractor de códigos.
- **Reimportar no puede pisar lo que el archivo no sabe.** Para un curso que ya existe, el
  director, el trimestre, `cyclesActive` y los encabezados salen del curso guardado, no
  del archivo. Las notas, observaciones y asistencia de los estudiantes las preserva
  `upsertCourseWithStudents`.
- **Regla de seguridad:** si la app tiene 0 y la plataforma ya tiene nota, se conserva
  la de la plataforma. Hojas de otro trimestre, grado o sin curso en la app quedan intactas.
- **Por curso (respaldo):** "Cargar Califica de la plataforma" en la página del curso
  (códigos + encabezados) y "Generar Califica" desde la plantilla de `public/templates`.
- **Encabezados:** cambian cada trimestre (títulos y códigos `log_31…`). La plataforma no
  es consistente con la puntuación (`T3 – C8`, `C2 - TÍTULO`); `parseAchievementDesc` lo
  tolera. Se validan contra `SLOTS_*` antes de escribir, que es posicional.
- Para validar un archivo generado: `node verificar-planilla.mjs original.xls generado.xls`
  en planilla-v2 (código 0 = sin problemas de identidad).

## Integraciones

- **planilla-v2:** el JSON de `codalum-extractor` hidrata `Student.codAlum`; la app
  exporta el JSON de `asistencia-autofill`, sin `fecha` porque la pone la plataforma;
  `verificar-planilla.mjs` compara Califica original vs generado.
- **Asistencia: copiar y pegar, no archivos.** El panel del autofill recibe el JSON en
  un `<textarea>` y el selector de archivo solo lo rellena, así que el camino normal es
  copiar desde el inicio y pegar ahí — sin ZIP, sin descomprimir y sin explorador de
  archivos, y funciona igual en el celular. El ZIP sigue como respaldo para cuando no
  hay portapapeles (contexto inseguro o permiso denegado).
- **Descargar entregas de Classroom.** Reemplaza el enlace externo a classroom-rpa, que
  se quitó de la barra. El ZIP se arma **en el navegador** (no en el servidor): un curso
  completo son decenas de archivos y una función de Vercel se corta al minuto; además así
  hay avance y cancelación. `api/classroom/drive/[fileId]` solo hace de puente, porque el
  token vive en el servidor.
- **Un Documento de Google no tiene bytes que descargar:** hay que pedirle a Drive que lo
  exporte (`lib/driveExport.ts` decide a qué). Sin eso el ZIP saldría casi vacío, porque
  la mayoría de los trabajos de Classroom son Documentos.
- **Descargar trabajos necesita el permiso `drive.readonly`**, que Google considera
  restringido: al añadirlo hay que volver a dar consentimiento, y para publicarlo a muchos
  docentes haría falta la verificación de Google.
- Cronograma, horario y detalle por módulo: ver `README.md`.
