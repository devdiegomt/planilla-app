# planilla-app

El trabajo de un docente de GLA, hecho app: notas, asistencia, horario y los
archivos que la plataforma del colegio pide. PWA local-first con copia en la nube.

**Producción:** https://planillaapp.vercel.app

## Qué hace

### Notas y Califica

1. **Arranca desde el Califica de todos los cursos.** Se descarga de la plataforma
   (*Importar/exportar planillas por profesor GLA* → Exportar) un solo `.xls` con una
   hoja por curso. La app crea los cursos que no existan con sus estudiantes, escribe
   los COD_ALUM y guarda los encabezados del trimestre por grado.
2. **Devuelve el mismo archivo** con las notas escritas por COD_ALUM (`lib/califica451.ts`),
   listo para importar en esa misma pantalla.
3. **Planilla tipo hoja de cálculo**, con observación por celda. Se recorre con las
   flechas y **se puede pegar una columna de notas desde un Excel**, con vista previa
   antes de aplicar.
4. **La definitiva con el algoritmo real de la plataforma** (ignora los ceros,
   redondeo half-up), no con el que trae un Excel: se sabe quién va aprobando de verdad.
5. **Importar la Planilla del año** (`PLANILLA-NOTAS-*.xlsx`) sigue estando, como
   camino alterno: trae la asistencia histórica y el director de grupo, que el
   Califica no tiene.

### Horario, calendario y día

6. **Rotación D1–D5 + Día Fijo** con festivos de Colombia (Ley Emiliani automática) y
   cancelaciones, que no consumen turno.
7. **Horario como horario**: filas = franjas, columnas = tipos de día. En el celular,
   un día a la vez como línea de tiempo.
8. **Franjas de descanso** con acompañamiento por día y **dos turnos** — el
   acompañamiento no dura todo el descanso.
9. **Lo temporal va aparte**: una reunión de esta semana o un reemplazo llevan fecha,
   salen en el día y se vencen solos.
10. **"Hoy" y "Mañana"** en el inicio: clases con su ciclo y estado F/R, más lo
    temporal de esa fecha.
11. **Calendario mensual** con el ciclo de cada curso y las entregas por color.

### Asistencia

12. **F/R por ciclo**, con `S1`/`S2` separadas para 11° y confirmación por sesión.
13. **Cuatro estados** (sin marca / injustificada / justificada, por falla y por retardo).
14. **Asistencia del día lista para pegar** en el autofill de planilla-v2, curso por
    curso, con botón de copiar.

### Reportes y seguimiento

15. **EFAS** consolidado en XLSX, con hoja de Salón de Honor (≥80).
16. **Correos de seguimiento** armados con las observaciones ya escritas, sin IA.
17. **To-do** con prioridad, vencimiento y curso opcional.
18. **Cierre de trimestre** con foto de las notas que no se vuelve a tocar.

### Classroom

19. **Cursos, tareas y entregas** en modo lectura.
20. **Descargar todos los trabajos en un ZIP**, con una carpeta por estudiante. El ZIP
    se arma en el navegador, con avance y cancelación.

### Copia y varios dispositivos

21. **Entrar con código al correo** (OTP), solo del dominio del colegio.
22. **Sincronización** de las 11 tablas locales, con lápidas para que los borrados
    viajen y conteo de conflictos.
23. **Copia de seguridad en JSON** de toda la base, que funciona aunque no haya servidor.
24. **Recordatorios push** por la mañana y por la tarde.
25. **Instalable en el celular**, y abre con su copia guardada aunque el servidor no
    responda.

## Stack

- **Next.js 15** (App Router) + React 19 + **Tailwind CSS**
- **Dexie 4** sobre IndexedDB — local-first, con hooks que ponen `syncId` y `updatedAt`
  en cada escritura
- **Supabase** — entrar con código y sincronizar (JSONB con RLS)
- **Resend** — el correo del código
- **google-auth-library** — OAuth2 de solo lectura a Classroom y Drive
- **SheetJS (xlsx)** — leer y escribir los `.xls` de la plataforma (BIFF8)
- **ExcelJS** — generar Califica y EFAS conservando estilos
- **JSZip** — armar el ZIP de entregas en el navegador
- **Deploy:** Vercel

## Comandos

```bash
npm install
cp .env.local.example .env.local   # y editarlo
npm run dev                        # http://localhost:3000
npx tsc --noEmit                   # typecheck: la puerta obligatoria
```

No hay runner de tests ni ESLint configurado. Las pruebas de lógica se hacen
transpilando los `.ts` de `src/lib` a CommonJS en una carpeta temporal **fuera del
repo** y corriéndolas con Node contra los archivos reales.

## Configuración

**Variables de entorno** (ver `.env.local.example`):

| Variable | Prefijo | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_` (safe) | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_` (safe) | anon key, protegida por RLS |
| `GOOGLE_CLIENT_ID` | server-only | OAuth client de Google Cloud |
| `GOOGLE_CLIENT_SECRET` | server-only | nunca en el bundle del cliente |
| `GOOGLE_REDIRECT_URI` | server-only | `http://localhost:3000/api/classroom/callback` en dev |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `NEXT_PUBLIC_` (safe) | generar con `npx web-push generate-vapid-keys --json` |
| `VAPID_PRIVATE_KEY` | server-only | la pareja privada — NUNCA con prefijo `NEXT_PUBLIC_` |
| `VAPID_SUBJECT` | server-only | `mailto:tu@correo` o URL |
| `CRON_SECRET` | server-only | lo manda Vercel Cron. Generar con `openssl rand -hex 32` |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | se salta RLS; solo el cron la usa |

**Supabase** — correr en orden en Dashboard → SQL Editor:

1. `supabase/schema.sql` — tabla `sync_records` + RLS
2. `supabase/migrations/002_tombstones.sql` — columna `deleted_at`
3. `supabase/migrations/003_push_subscriptions.sql` — tabla para VAPID
4. `supabase/migrations/004_dominio_institucional.sql` — solo `@gla.edu.co` sincroniza.
   **Correr primero la consulta del PASO 1 que trae comentada**: lista a quién dejarías
   afuera. Si aparece una cuenta en uso, resolverlo antes de aplicar el resto.

> El dominio se compara **completo y por la última arroba**, nunca con `like %`:
> `alguien@gla.edu.co.otrositio.com` no es del colegio. `lib/allowedDomain.ts` avisa en
> el navegador, pero la puerta de verdad es la política de RLS, porque un filtro de
> cliente se salta.

**Entrar con código** necesita SMTP propio en Supabase (el default rate-limita fuerte).
Resend en Authentication → Emails → SMTP Settings: host `smtp.resend.com`, puerto `465`,
usuario `resend`, contraseña `re_…`. El template "Magic Link" tiene que incluir
`{{ .Token }}`, no solo el enlace.

**Google OAuth** — proyecto en Google Cloud Console con Classroom API y Drive API
habilitadas, OAuth Client Web con los redirect URIs de localhost y de producción.

> Descargar trabajos necesita el permiso `drive.readonly`, que Google considera
> **restringido**: al añadirlo hay que volver a dar consentimiento, y publicarlo a
> muchos docentes exigiría la verificación de Google.

**Recordatorios** — dos crons en `vercel.json`, ambos con `Authorization: Bearer $CRON_SECRET`:

| cron | UTC | COT | ruta | qué manda |
|---|---|---|---|---|
| matutino | `0 12 * * 1-5` | 7 AM | `/api/push/daily-reminders` | la agenda del día |
| vespertino | `0 20 * * 1-5` | 3 PM | `/api/push/afternoon-reminders` | F/R de hoy sin registrar |

`lib/pushCron.ts` tiene la maquinaria común y las rutas solo eligen el compositor.

> **El vespertino calla cuando no hay nada pendiente.** Un aviso que también llega para
> decir "todo al día" se vuelve ruido y se aprende a ignorar.

> **Plan Hobby de Vercel: dos crons es el tope.** Un tercero obligaría a fusionar rutas
> con un parámetro o a subir de plan.

> **La fecha se ancla a UTC-5 explícitamente** (`todayInBogota()`), no a la zona del
> runtime. Vercel corre en UTC: `todayIso()` acertaría solo mientras el cron dispare
> después de las 05:00 UTC.

> **El cron consulta por lotes.** En serie, con `maxDuration` de 60 s, fallaba **en
> silencio** al crecer el número de docentes. Ahora reporta `truncated` y `usersPending`.

## Estructura

```
src/
├── app/
│   ├── page.tsx                  # el día: Hoy + Pendientes + Cursos + Asistencia + Reportes
│   ├── ajustes/                  # materias, cierre, copia, reparación, notificaciones
│   ├── auth/                     # entrar con código al correo
│   ├── curso/[code]/             # planilla, F/R por ciclo, estadísticas, historial
│   ├── horario/                  # rejilla de franjas + "Estos días" (lo temporal)
│   ├── calendario/               # mensual con tipo de día, ciclo y entregas
│   ├── pendientes/               # to-do
│   ├── classroom/                # cursos, tareas, entregas y descarga en ZIP
│   ├── correos/                  # correos de seguimiento
│   └── api/
│       ├── classroom/            # login, callback, cursos, tareas, entregas, drive
│       └── push/                 # subscribe, test y los dos crons
├── lib/
│   ├── constants.ts              # SLOTS_8_10 / SLOTS_11 y la escala de notas
│   ├── formula.ts                # calcDef (strict + platform)
│   ├── califica451.ts            # el .xls de todos los cursos: leer y reescribir
│   ├── califica.ts / exporter.ts # Califica por curso desde la plantilla
│   ├── importer.ts               # Planilla del año
│   ├── efasExporter.ts           # EFAS + salón de honor
│   ├── studentMatch.ts           # a quién corresponde cada fila al importar
│   ├── pasteNotas.ts             # pegar notas de un Excel: arma el plan
│   ├── gridNav.ts                # moverse por la cuadrícula con el teclado
│   ├── schedule.ts               # rotación D1–D5 + Fijo
│   ├── horarioGrid.ts            # franjas, descansos, turnos y numeración de horas
│   ├── dayAgenda.ts              # el horario del día + lo temporal de esa fecha
│   ├── cycles.ts                 # en qué ciclo va cada curso cada día
│   ├── attendance.ts             # los cuatro estados de asistencia
│   ├── attendanceExport.ts       # JSON para el autofill de planilla-v2
│   ├── codalum.ts                # JSON del extractor → Student.codAlum
│   ├── db.ts                     # Dexie v13 + hooks de sync + helpers
│   ├── sync.ts / syncId.ts       # subir, bajar y claves estables entre equipos
│   ├── retention.ts              # poda del historial de ediciones
│   ├── backup.ts                 # copia en JSON de toda la base
│   ├── recovery.ts               # reparar el navegador sin tocar los datos
│   ├── allowedDomain.ts          # solo el dominio del colegio
│   ├── subjects.ts / courseOrder.ts  # materias y cursos del docente, no constantes
│   ├── setupSteps.ts             # los pasos que faltan para dejarla lista
│   ├── submissionsZip.ts / driveExport.ts  # ZIP de entregas y exportar Documentos
│   ├── emails.ts                 # correos de seguimiento
│   └── pushCron.ts / reminder.ts # recordatorios
├── components/                   # 46 componentes de cliente
└── types/index.ts                # entidades con syncId + updatedAt

public/
├── templates/Califica-*.xlsx     # bases del exportador por curso
└── sw.js                         # service worker

supabase/
├── schema.sql
└── migrations/00{2,3,4}_*.sql
```

## La fórmula

Dos cálculos en `formula.ts`:

**`strict`** — lo que hace un Excel normal: los 0 cuentan como notas reales. Si K =
C4:60 % + C5:40 % con C4=100 y C5=0, K da 60. Con esa cuenta, mientras no se califique
un ciclo la definitiva de todos se hunde.

**`platform`** (el que usa la app) — lo que hace la plataforma del colegio: **los 0 se
ignoran**, porque `0` significa "sin calificar" y no "sacó cero". El mismo ejemplo da
K = 100.

1. Por categoría: promedio ponderado reescalando los pesos entre las subnotas > 0
2. Definitiva: promedio simple de las categorías con resultado > 0
3. Redondeo: half-up

**Validado contra el panel real de la plataforma.** No se cambia sin volver a validar.

### Pesos internos

Cada categoría K/M/U/C/E pesa 20 % de la definitiva. Los pesos de adentro cambian
entre 8°–10° y 11°:

| Categoría | 8°–10° | 11° |
|---|---|---|
| KNOWLEDGE | C4:60 + C5:40 | C2:60 + C4:40 |
| METHOD | C6:50 + C8:50 | C3:40 + C6:60 |
| USE | C2:50 + C9:50 | C5:25 + C8:50 + C9:25 |
| COMMUNICATION | C3:25 + C4:25 + C5:50 | C3:25 + C4:25 + C6:50 |
| EV | C7:100 | C7:100 |

> La escala: `0` = sin calificar, `30` = la mínima real, 70 aprueba, 80 es experto,
> 100 el máximo.

## Modelo de datos (Dexie v13)

Ver `src/types/index.ts`. Cada `Student` guarda metadata (codAlum, nombre, orden,
retiro), `cycles[9]` con F/R y observación por ciclo — y `S1`/`S2` en 11° —, y
`subnotas` con 10 u 11 claves según el grado.

**Metadata de sync**, que ponen los hooks:

- `syncId` — UUID estable entre equipos, **determinista** (`lib/syncId.ts`): el mismo
  curso o estudiante da el mismo UUID en cualquier dispositivo, así que reimportar no
  duplica.
- `updatedAt` — cuándo cambió por última vez, que es la base del last-write-wins.

**Relaciones por `courseCode` y `studentSyncId`, nunca por los ids de Dexie**, que son
locales y se borran antes de subir.

**Borrados:** los estudiantes retirados no se borran, se marcan con `withdrawnAt`. El
resto se borra de verdad, y el hook `deleting` encola una lápida que viaja a Supabase
para que el borrado llegue a los otros equipos. Cuando el borrado significa "este
equipo ya no lo guarda" y no "bórralo en todas partes", va con `withoutTombstone`.

**Cómo sincroniza:**

1. Cada escritura sube `updatedAt`
2. Se suben las filas con `updatedAt > lastPush`, y después las lápidas
3. Se bajan las remotas con `updated_at > lastPull`, se resuelve por fecha y se aplican
   las lápidas remotas como borrados locales
4. El estado en la barra dispara sync manual, automático cada 60 s y al escribir (5 s)

**Se poda el historial de ediciones, no las notas.** `changeLog` guarda 180 días
(`lib/retention.ts`); las notas y lo archivado no se tocan nunca.

## El horario

Las filas se derivan agrupando los bloques por inicio–fin; no hay tabla de franjas.

- **Las horas se numeran por dónde hay clase.** Numerar "toda fila que no sea descanso"
  se rompió dos veces: una actividad dentro del descanso, y después un evento con horas
  propias. En ambos casos la fila se numeraba y corría todo lo siguiente — la 7ª hora
  terminaba de 8ª.
- **Las franjas las definen las clases y los descansos, no los eventos.** Un evento cae
  en la franja con la que más se cruza y solo abre fila propia si no se cruza con
  ninguna. El chip muestra sus horas cuando no son las de la franja.
- **El descanso es de la franja**, guardado como un bloque por tipo de día, con su
  acompañamiento (`note`) propio de cada día.
- **Dos turnos:** el acompañamiento no dura todo el descanso. La hora de corte
  (`turnSplit`) es de la franja y el turno (`turn`) de cada día. Se guarda en vez de
  partir por la mitad porque los turnos no duran lo mismo: el descanso es 15+15 y el
  almuerzo 25+30.
- **Lo que se repite y lo que pasa una vez son cosas distintas.** El horario vuelve en
  cada vuelta D1→D5; una reunión de esta semana o un reemplazo llevan fecha
  (`CalendarEvent`), salen en su hora dentro del día y se vencen solos.
- **El próximo D2 no es el martes que viene.** El viernes es Fijo y no consume rotación,
  así que la vuelta se corre un día por semana. Por eso crear algo temporal desde una
  celda del horario calcula la fecha con `nextDateOfDayType` y no sumando siete días.
- **La rotación es continua** entre trimestres. El primer día de cada uno se fuerza a D1
  desde `/calendario`, y las semanas sin clase se marcan; si no, la numeración de ciclos
  queda corrida de ahí en adelante.

## La planilla

- **La casilla de nota no es `type="number"`**: ahí las flechas suben y bajan el valor,
  y calificando lo que se quiere es bajar por la columna. Las flechas cambian de
  casilla, Enter baja, y ← → solo cambian de columna con el cursor en la punta.
- **Pegar una columna desde un Excel nunca se aplica de una.** Si lo pegado trae códigos
  o nombres, empareja por ahí y el orden del Excel deja de importar. Si solo trae
  números, va por posición — y entonces basta que el Excel esté ordenado distinto para
  que todo caiga en el estudiante equivocado, en silencio. Por eso siempre hay vista
  previa. Una celda vacía significa "no toques esa nota", no 0.

## Integración con planilla-v2

[planilla-v2](https://github.com/devdiegomt/planilla-v2) son userscripts que corren
sobre Classroom Live, la plataforma del colegio.

| | produce | consume |
|---|---|---|
| `codalum-extractor` | JSON con los COD_ALUM | — |
| `historial-extractor` | JSON con la definitiva de cada trimestre | — |
| **planilla-app** | JSON de asistencia | JSON de COD_ALUM, JSON de historial |
| `asistencia-autofill` | marca F/R en la plataforma | JSON de asistencia |
| `verificar-planilla.mjs` | compara Califica original vs generado | los dos archivos |

La app es la pieza del medio porque es la única que sabe **en qué fecha cae cada
ciclo**: el docente registra F/R por ciclo y la plataforma los quiere por fecha.

> **Arrancar por el Califica se ahorra el extractor:** ese archivo trae el COD_ALUM, que
> la Planilla del año no tiene.

**Historial de trimestres: en cuánto lleva la materia cada estudiante.** La app solo
tiene las notas del trimestre en curso —la plantilla se reemplaza cada trimestre—, y la
plataforma tiene las anteriores pero las muestra de a un curso y un periodo por vez.
`historial-extractor` las recorre y la app las junta: en la página del curso, una línea
`T1 · T2 · T3 → va en` por estudiante. Solo la **definitiva**: el desglose por categoría
y la asistencia ya están acá de primera mano.

Ojo con "va en": es el promedio de los trimestres que ya tienen nota, para ver cómo
viene cada uno. **No es la definitiva del año**, que la calcula el colegio y puede no ser
un promedio simple.

**El extractor es relleno, no flujo normal.** Cerrar el trimestre en la app ya archiva la
definitiva de cada estudiante, así que quien la usa desde el inicio del año nunca lo
necesita: la tabla se llena sola trimestre a trimestre. Existe para el caso contrario —
empezar con el año ya empezado, con trimestres que nunca se cerraron acá. Si un trimestre
está cerrado acá **y** traído de la plataforma, y no coinciden, se muestran los dos: eso
suele significar que ese Califica no llegó a subirse.

**Asistencia: copiar y pegar, no archivos.** El panel del autofill recibe el JSON en un
`<textarea>`, así que el camino normal es copiar desde el inicio y pegar ahí — sin ZIP,
sin descomprimir y sin explorador de archivos, y funciona igual en el celular. El ZIP
queda de respaldo para cuando no hay portapapeles.

Reglas del export que no son obvias:

- **El JSON no lleva `fecha`, a propósito**: la plataforma pone la de hoy. Una fecha
  arrastrada dejaría la asistencia en otro día sin que nada lo delate. A cambio, el
  archivo solo sirve el mismo día de la clase, y el botón avisa en rojo si el ciclo que
  se exporta no cae hoy.
- **La ventana es la del trimestre del curso**, no la de hoy.
- **Una ausencia absorbe al retardo**: no se puede llegar tarde a una clase a la que no
  se asistió, y la plataforma acepta un solo tipo por estudiante.
- **Solo se reporta a quien tiene algo que reportar**; el que no aparece se asume presente.
- **Los retirados nunca se exportan**, y los activos sin código se excluyen y se listan
  aparte: sin código no hay forma de identificarlos en la plataforma.
- **11° genera dos archivos por ciclo** (`-S1`, `-S2`), en fechas y bloques distintos.

**Validar un Califica generado:** `node verificar-planilla.mjs original.xls generado.xls`
en planilla-v2. Código 0 = sin problemas de identidad.

### Reemplazar Tampermonkey

Medido en septiembre de 2026: la pantalla de asistencia **no tiene CSP** y un
bookmarklet corre ahí. La limitación es de diseño: el "flujo completo" recorre el filtro
y cada paso recarga la página; un userscript se reinyecta y un favorito no. Por eso como
bookmarklet se elige el filtro a mano y se usa "Solo marcar". Ver el README de planilla-v2.

## Operación

**El colegio sale a internet por una sola IP.** Las mitigaciones automáticas de Vercel
la bloquearon por huella TLS (consistente con un proxy que inspecciona TLS) y la app
devolvía 403 desde el colegio y abría bien desde datos móviles. Se resolvió con una
regla **Bypass** en Vercel Firewall para esa IP. Vale la pena mirar *Denied* de vez en
cuando por si aparece otra.

> **Un 403 o un 503 no hacen que `fetch` lance.** El service worker solo caía al caché
> en el `catch`, así que un bloqueo se mostraba tal cual teniendo la copia guardada — lo
> peor de los dos mundos en una app local-first. Ahora las fallas del servidor (403, 408,
> 429, 5xx) también sirven la copia. El 404 queda fuera a propósito: ahí la ruta de
> verdad no existe.

## Qué falta

- [ ] Generalizar `SLOTS_8_10` / `SLOTS_11`, que siguen atados a una materia. Hace falta
      un Califica de otra asignatura para saber qué varía.
- [ ] Reconciliar notas contra la plataforma (pide que el extractor conserve las
      columnas de notas).
- [ ] Importar el calendario y las circulares del colegio para dejar de teclear entregas.
- [ ] Historial de los cuatro periodos.
- [ ] Verificar dominio propio en Resend para envío a muchos docentes.
- [ ] Resolver conflictos de sync fila por fila.
- [ ] Un clic para subir la asistencia: hoy exige Tampermonkey porque el panel se pierde
      al recargar. El camino real a escala es una extensión propia publicada.

### Descartado

- **Agente IA calificador.** La calificación la hace el docente.
- **Enlace externo para descargar entregas.** Ahora se descargan desde la app, en un ZIP
  con una carpeta por estudiante.
