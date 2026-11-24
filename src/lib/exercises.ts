/**
 * Catálogo de ejercicios para autocompletar. Los nombres son los que se usan en los gimnasios de Chile
 * (mezcla de español e inglés: "hip thrust", "face pull"). `alias` permite encontrarlos por el otro nombre
 * ("squat" → Sentadilla libre). El PT también puede escribir ejercicios propios: el campo es libre.
 */
export type Exercise = { name: string; group: string; alias?: string[] };

const g = (group: string, items: (string | [string, ...string[]])[]): Exercise[] =>
  items.map((it) => (typeof it === "string" ? { name: it, group } : { name: it[0], group, alias: it.slice(1) }));

export const EXERCISES: Exercise[] = [
  ...g("Piernas", [
    ["Sentadilla libre", "squat", "back squat", "sentadilla con barra"],
    ["Sentadilla frontal", "front squat"],
    ["Sentadilla goblet", "goblet squat"],
    ["Sentadilla búlgara", "bulgarian split squat", "split squat"],
    ["Sentadilla hack", "hack squat"],
    ["Sentadilla en máquina Smith", "smith squat", "multipower"],
    ["Prensa de piernas", "leg press", "prensa"],
    ["Extensión de cuádriceps", "leg extension", "silla de cuádriceps", "sillón de cuádriceps"],
    ["Curl femoral tumbado", "lying leg curl", "femorales"],
    ["Curl femoral sentado", "seated leg curl"],
    ["Peso muerto", "deadlift"],
    ["Peso muerto rumano", "rdl", "romanian deadlift"],
    ["Peso muerto a piernas rígidas", "stiff", "stiff leg deadlift"],
    ["Peso muerto sumo", "sumo deadlift"],
    ["Zancadas", "lunges", "estocadas"],
    ["Zancadas caminando", "walking lunges"],
    ["Zancada reversa", "reverse lunge"],
    ["Step up", "subida al cajón", "subidas al banco"],
    ["Hip thrust", "empuje de cadera", "puente de glúteos con barra"],
    ["Puente de glúteos", "glute bridge"],
    ["Patada de glúteo en polea", "glute kickback", "patada de glúteo"],
    ["Abducción de cadera en máquina", "abductores", "hip abduction"],
    ["Aducción de cadera en máquina", "aductores", "hip adduction"],
    ["Buenos días", "good morning"],
    ["Elevación de talones de pie", "calf raise", "gemelos", "pantorrillas"],
    ["Elevación de talones sentado", "seated calf raise"],
    ["Sissy squat"],
  ]),
  ...g("Pecho", [
    ["Press banca", "bench press", "press plano", "press de banca"],
    ["Press banca inclinado", "incline bench press", "press inclinado"],
    ["Press banca declinado", "decline bench press"],
    ["Press con mancuernas", "dumbbell press", "press plano con mancuernas"],
    ["Press inclinado con mancuernas", "incline dumbbell press"],
    ["Press de pecho en máquina", "chest press", "press máquina"],
    ["Aperturas con mancuernas", "dumbbell fly", "aperturas"],
    ["Aperturas inclinadas con mancuernas", "incline fly"],
    ["Cruce de poleas", "cable crossover", "cable fly"],
    ["Peck deck", "contractora", "pec deck", "aperturas en máquina"],
    ["Fondos en paralelas", "dips", "fondos"],
    ["Flexiones de brazos", "push up", "lagartijas", "flexiones"],
    ["Pullover con mancuerna", "pullover"],
  ]),
  ...g("Espalda", [
    ["Dominadas", "pull up", "pull-up"],
    ["Dominadas supinas", "chin up", "chin-up"],
    ["Dominadas asistidas", "assisted pull up"],
    ["Jalón al pecho", "lat pulldown", "polea al pecho", "jalón"],
    ["Jalón agarre cerrado", "close grip pulldown"],
    ["Jalón tras nuca", "behind the neck pulldown"],
    ["Remo con barra", "barbell row", "bent over row"],
    ["Remo con mancuerna", "dumbbell row", "remo a una mano", "one arm row"],
    ["Remo en polea baja", "seated cable row", "remo sentado", "remo en polea"],
    ["Remo en máquina", "machine row"],
    ["Remo T", "t-bar row", "remo en t"],
    ["Remo invertido", "inverted row", "remo australiano"],
    ["Pullover en polea", "straight arm pulldown", "pulldown con brazos rectos"],
    ["Face pull", "jalón a la cara", "tirón a la cara"],
    ["Encogimientos de hombros", "shrugs", "trapecios"],
    ["Hiperextensiones", "back extension", "extensiones lumbares", "lumbares"],
    ["Superman"],
  ]),
  ...g("Hombros", [
    ["Press militar", "overhead press", "ohp", "press de hombros con barra"],
    ["Press de hombros con mancuernas", "dumbbell shoulder press", "press hombros"],
    ["Press de hombros en máquina", "shoulder press machine"],
    ["Press Arnold", "arnold press"],
    ["Elevaciones laterales", "lateral raise", "vuelos laterales"],
    ["Elevaciones laterales en polea", "cable lateral raise"],
    ["Elevaciones frontales", "front raise"],
    ["Pájaros", "rear delt fly", "vuelos posteriores", "deltoide posterior", "reverse fly"],
    ["Remo al mentón", "upright row"],
    ["Landmine press"],
  ]),
  ...g("Bíceps", [
    ["Curl de bíceps con barra", "barbell curl", "curl con barra"],
    ["Curl de bíceps con mancuernas", "dumbbell curl", "curl con mancuernas"],
    ["Curl martillo", "hammer curl"],
    ["Curl en banco Scott", "preacher curl", "scott"],
    ["Curl en polea", "cable curl"],
    ["Curl concentrado", "concentration curl"],
    ["Curl inclinado con mancuernas", "incline curl"],
    ["Curl con barra Z", "ez bar curl", "barra z"],
  ]),
  ...g("Tríceps", [
    ["Extensión de tríceps en polea", "pushdown", "tríceps en polea", "jalón de tríceps"],
    ["Extensión de tríceps con cuerda", "rope pushdown", "tríceps con cuerda"],
    ["Press francés", "skull crusher", "skullcrusher"],
    ["Extensión de tríceps tras nuca", "overhead triceps extension", "tríceps sobre la cabeza"],
    ["Fondos en banco", "bench dips", "fondos de tríceps"],
    ["Patada de tríceps", "triceps kickback"],
    ["Press cerrado", "close grip bench press", "press banca agarre cerrado"],
  ]),
  ...g("Core", [
    ["Plancha", "plank", "plancha frontal"],
    ["Plancha lateral", "side plank"],
    ["Crunch abdominal", "crunch", "abdominales"],
    ["Crunch en polea", "cable crunch"],
    ["Elevación de piernas colgado", "hanging leg raise", "elevación de piernas"],
    ["Elevación de rodillas colgado", "hanging knee raise"],
    ["Rueda abdominal", "ab wheel", "ab roller"],
    ["Russian twist", "giros rusos", "rotación rusa"],
    ["Bicicleta abdominal", "bicycle crunch"],
    ["Dead bug", "bicho muerto"],
    ["Bird dog", "perro de caza"],
    ["Pallof press", "anti rotación"],
    ["Mountain climbers", "escaladores", "escalador"],
    ["Leñador en polea", "wood chop", "woodchopper"],
  ]),
  ...g("Cardio y funcional", [
    ["Caminadora", "cinta", "treadmill", "trotadora", "cinta de correr"],
    ["Trote", "running", "correr"],
    ["Bicicleta estática", "bike", "spinning", "ciclismo"],
    ["Elíptica", "elliptical"],
    ["Remo ergómetro", "rowing", "concept2", "remo en máquina cardio"],
    ["Escaladora", "stairmaster", "escalera"],
    ["Cuerda para saltar", "jump rope", "soga", "saltar la cuerda"],
    ["Burpees"],
    ["Salto al cajón", "box jump"],
    ["Kettlebell swing", "swing", "balanceo con pesa rusa"],
    ["Kettlebell clean and press", "clean and press"],
    ["Caminata del granjero", "farmer's walk", "farmer walk"],
    ["Battle ropes", "cuerdas de batalla"],
    ["Empuje de trineo", "sled push", "trineo"],
    ["Wall ball", "lanzamiento de balón"],
    ["Thruster", "thrusters"],
    ["Cargada", "clean", "power clean"],
    ["Arranque", "snatch"],
    ["Jumping jacks", "saltos de tijera"],
    ["Saltos de sentadilla", "jump squat"],
  ]),
  ...g("Movilidad y calentamiento", [
    ["Calentamiento articular", "warm up", "warmup", "entrada en calor"],
    ["Movilidad de cadera", "hip mobility"],
    ["Movilidad de hombros", "shoulder mobility"],
    ["Movilidad de columna torácica", "thoracic mobility", "gato camello", "cat cow"],
    ["Estiramientos", "stretching", "elongación"],
    ["Foam roller", "rodillo", "liberación miofascial"],
    ["Activación de glúteos", "glute activation", "banda en glúteos"],
  ]),
];

/** Minúsculas y sin tildes, para comparar "Elíptica" con "eliptica". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type ExerciseSuggestion = { name: string; group: string; custom: boolean };

/**
 * Sugerencias para lo que el PT va escribiendo. Primero los nombres que empiezan igual, luego los que tienen
 * una palabra que empieza igual, luego los que lo contienen, y al final los alias. Sus ejercicios propios
 * (los que ya usó en otras rutinas y no están en el catálogo) se mezclan con el mismo criterio.
 */
export function searchExercises(query: string, own: string[] = [], limit = 8): ExerciseSuggestion[] {
  const q = normalize(query);
  const catalog = new Set(EXERCISES.map((e) => normalize(e.name)));
  const pool: { name: string; group: string; custom: boolean; alias: string[] }[] = [
    ...own
      .filter((n) => !catalog.has(normalize(n)))
      .map((n) => ({ name: n, group: "Tus ejercicios", custom: true, alias: [] })),
    ...EXERCISES.map((e) => ({ name: e.name, group: e.group, custom: false, alias: e.alias ?? [] })),
  ];
  if (q === "") return pool.filter((e) => e.custom).slice(0, limit).map(({ name, group, custom }) => ({ name, group, custom }));

  const scored: { s: ExerciseSuggestion; rank: number }[] = [];
  for (const e of pool) {
    const n = normalize(e.name);
    const words = n.split(" ");
    let rank = -1;
    if (n === q) rank = 0;
    else if (n.startsWith(q)) rank = 1;
    else if (words.some((w) => w.startsWith(q))) rank = 2;
    else if (n.includes(q)) rank = 3;
    else if (e.alias.some((a) => normalize(a).startsWith(q))) rank = 4;
    else if (e.alias.some((a) => normalize(a).includes(q))) rank = 5;
    if (rank >= 0) scored.push({ s: { name: e.name, group: e.group, custom: e.custom }, rank: rank * 2 + (e.custom ? 0 : 1) });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name, "es"))
    .slice(0, limit)
    .map((x) => x.s);
}
