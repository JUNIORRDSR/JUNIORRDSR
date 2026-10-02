// Culebrita que crece: se come los días con contribuciones y gana un segmento por cada fecha.
// Busca el día más cercano (BFS) y antes de ir comprueba que después pueda seguir alcanzando
// su cola, para no encerrarse. Escribe dist/snake-light.svg y dist/snake-dark.svg.
// uso: GITHUB_TOKEN=... node snake.mjs <usuario> <carpeta>
import { mkdirSync, writeFileSync } from 'node:fs';

const [user = 'JUNIORRDSR', out = 'dist'] = process.argv.slice(2);
const START_LEN = 3;
const MAX_LEN = 80; // ponytail: tope fijo; con muchos días activos el tablero se llena y el solver empieza a atravesarse
const STEP = 90; // ms por casilla
const PAUSE = 2500; // ms quieta al final antes de repetir
const PITCH = 16, CELL = 12;

const THEMES = {
  light: { empty: '#EBEDF0', levels: ['#FFD9C7', '#FFB08A', '#FF7F45', '#FF4F00'], snake: '#1F2328', bar: '#FF4F00' },
  dark: { empty: '#161B22', levels: ['#4A2414', '#7A3415', '#C24A12', '#FF6A2B'], snake: '#E6EDF3', bar: '#FF6A2B' },
};
const LEVEL = { FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function calendar() {
  const query = `query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionLevel weekday}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { u: user } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub GraphQL: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
  return json.data.user.contributionsCollection.contributionCalendar.weeks;
}

const key = (x, y) => `${x},${y}`;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function solve(weeks) {
  const W = weeks.length, H = 7;
  const inside = (x, y) => x >= -1 && x <= W && y >= -1 && y <= H; // tablero con un margen alrededor
  const food = new Map();
  weeks.forEach((w, x) => w.contributionDays.forEach(d => {
    if (LEVEL[d.contributionLevel]) food.set(key(x, d.weekday), { x, y: d.weekday, level: LEVEL[d.contributionLevel] });
  }));
  const total = food.size;

  // la culebrita entra por el margen izquierdo; snake[0] es la cabeza
  let snake = Array.from({ length: START_LEN }, (_, i) => [-1, START_LEN - 1 - i]);
  const path = [...snake].reverse().map(([x, y]) => [x, y]); // posiciones de la cabeza en el tiempo
  const eats = []; // { step, x, y, level }

  // BFS desde la cabeza evitando el cuerpo (la cola queda libre porque se mueve)
  const bfs = (body, isGoal, ignoreBody = false) => {
    const [hx, hy] = body[0];
    const blocked = ignoreBody ? new Set() : new Set(body.slice(0, -1).map(([x, y]) => key(x, y)));
    const prev = new Map([[key(hx, hy), null]]);
    const queue = [[hx, hy]];
    const goals = [];
    while (queue.length) {
      const [x, y] = queue.shift();
      if ((x !== hx || y !== hy) && isGoal(x, y)) goals.push([x, y]);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!inside(nx, ny) || prev.has(k) || blocked.has(k)) continue;
        prev.set(k, [x, y]);
        queue.push([nx, ny]);
      }
    }
    const route = ([gx, gy]) => {
      const r = [];
      for (let c = [gx, gy]; c[0] !== hx || c[1] !== hy; c = prev.get(key(...c))) r.unshift(c);
      return r;
    };
    return goals.map(route); // ordenadas de la más cercana a la más lejana
  };

  const simulate = (body, route) => {
    let b = body.map(c => [...c]), eaten = new Set();
    for (const [x, y] of route) {
      const k = key(x, y);
      b.unshift([x, y]);
      if (food.has(k) && !eaten.has(k) && b.length <= MAX_LEN) eaten.add(k);
      else b.pop();
    }
    return b;
  };

  const step = ([x, y]) => {
    snake.unshift([x, y]);
    path.push([x, y]);
    const k = key(x, y), f = food.get(k);
    if (f) {
      food.delete(k);
      eats.push({ step: path.length - START_LEN, ...f });
      if (snake.length <= MAX_LEN) return;
    }
    snake.pop();
  };

  let stalls = 0;
  while (food.size) {
    const routes = bfs(snake, (x, y) => food.has(key(x, y))).slice(0, 10);
    // la primera ruta segura: tras comer todavía puede llegar a su cola
    let route = routes.find(r => {
      const after = simulate(snake, r);
      const tail = after[after.length - 1];
      return bfs(after, (x, y) => x === tail[0] && y === tail[1]).length > 0;
    });
    if (!route && routes.length) {
      // ninguna es segura: da un paso hacia su cola para abrir espacio y lo vuelve a intentar
      const tail = snake[snake.length - 1];
      const toTail = bfs(snake, (x, y) => x === tail[0] && y === tail[1])[0];
      route = toTail?.length && stalls++ < 400 ? toTail.slice(0, 1) : routes[0]; // tope para no perseguirse la cola para siempre
    }
    if (!route) route = bfs(snake, (x, y) => food.has(key(x, y)), true)[0]; // encerrada: atraviesa su cuerpo
    for (const c of route) step(c);
  }

  // salida por la derecha hasta perderse de vista
  const exit = bfs(snake, (x, y) => x === W && y === snake[0][1], true)[0] ?? [];
  for (const c of exit) step(c);
  for (let i = 1; i <= snake.length + 1; i++) step([W + i, snake[0][1]]);

  return { W, H, path, eats, total, weeks };
}

function render({ W, H, path, eats, total, weeks }, t) {
  const width = (W + 2) * PITCH, height = (H + 2) * PITCH + 18;
  const T = (path.length - 1) * STEP + PAUSE;
  const pct = ms => (ms / T * 100).toFixed(4);
  const px = (x, y) => [(x + 1) * PITCH + 2, (y + 1) * PITCH + 2];
  const css = [];
  const body = [];

  // casillas: las que tienen contribuciones cambian a vacías en el instante en que se las come
  const eatAt = new Map(eats.map((e, i) => [key(e.x, e.y), { ...e, i }]));
  weeks.forEach((w, x) => w.contributionDays.forEach(d => {
    const [cx, cy] = px(x, d.weekday), e = eatAt.get(key(x, d.weekday));
    const fill = e ? t.levels[e.level - 1] : t.empty;
    body.push(`<rect${e ? ` class="c${e.i}"` : ''} x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2.5" fill="${fill}"/>`);
    if (e) {
      const p = pct(e.step * STEP);
      css.push(`.c${e.i}{animation:c${e.i} ${T}ms linear infinite}@keyframes c${e.i}{0%,${p}%{fill:${fill}}${(+p + 0.01).toFixed(4)}%,100%{fill:${t.empty}}}`);
    }
  }));

  // recorrido de la cabeza: una sola animación que comparten todos los segmentos, cada uno con su retraso
  const frames = path.map(([x, y], j) => {
    const [cx, cy] = px(x, y);
    return `${pct(j * STEP)}%{transform:translate(${cx}px,${cy}px)}`;
  });
  const [lx, ly] = px(...path[path.length - 1]);
  css.push(`@keyframes h{${frames.join('')}100%{transform:translate(${lx}px,${ly}px)}}`);

  const maxLen = Math.min(MAX_LEN, START_LEN + eats.length);
  const segs = [];
  for (let i = maxLen - 1; i >= 0; i--) { // la cabeza se dibuja encima
    const size = CELL - Math.min(i, 40) * 0.1;
    const off = (CELL - size) / 2;
    const delay = (i - (START_LEN - 1)) * STEP;
    let anim = `h ${T}ms linear ${delay}ms infinite both`;
    if (i >= START_LEN) { // aparece cuando se come la fecha que la hace crecer
      const p = pct(eats[i - START_LEN].step * STEP);
      css.push(`@keyframes o${i}{0%,${p}%{opacity:0}${(+p + 0.01).toFixed(4)}%,100%{opacity:1}}`);
      anim += `,o${i} ${T}ms linear infinite`;
    }
    css.push(`.s${i}{animation:${anim}}`);
    segs.push(`<g class="s${i}"><rect x="${off.toFixed(1)}" y="${off.toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="${i ? 3 : 4}" fill="${i ? t.snake : t.bar}"/></g>`); // la cabeza va en naranja para que se vea hacia dónde avanza
  }

  // barra de progreso: avanza un tramo por cada fecha comida
  const barW = width - 4, barY = height - 12;
  const barFrames = ['0%{transform:scaleX(0)}'];
  eats.forEach((e, i) => {
    const p = +pct(e.step * STEP);
    barFrames.push(`${p.toFixed(4)}%{transform:scaleX(${(i / total).toFixed(4)})}${(p + 0.01).toFixed(4)}%{transform:scaleX(${((i + 1) / total).toFixed(4)})}`);
  });
  barFrames.push('100%{transform:scaleX(1)}');
  css.push(`.bar{transform-box:fill-box;transform-origin:left;animation:bar ${T}ms linear infinite}@keyframes bar{${barFrames.join('')}}`);
  body.push(`<rect x="2" y="${barY}" width="${barW}" height="6" rx="3" fill="${t.empty}"/>`);
  body.push(`<rect class="bar" x="2" y="${barY}" width="${barW}" height="6" rx="3" fill="${t.bar}"/>`);
  body.push(`<g class="sn">${segs.join('')}</g>`);

  css.push('@media (prefers-reduced-motion:reduce){.sn{display:none}rect{animation:none!important}}');
  const label = `Una culebrita recorre el calendario de contribuciones, se come los ${total} días con actividad y crece con cada uno`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><title>${label}</title><style>${css.join('')}</style>${body.join('')}</svg>\n`;
}

if (process.argv.includes('--test')) { // autoprueba con un calendario sintético muy activo
  const { default: assert } = await import('node:assert');
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
  const weeks = Array.from({ length: 53 }, () => ({
    contributionDays: Array.from({ length: 7 }, (_, d) => ({ weekday: d, contributionLevel: levels[rand() < 0.5 ? 0 : 1 + Math.floor(rand() * 4)] })),
  }));
  const r = solve(weeks);
  assert.equal(r.eats.length, r.total, 'se come todas las fechas');
  r.path.slice(1).forEach(([x, y], i) => assert.equal(Math.abs(x - r.path[i][0]) + Math.abs(y - r.path[i][1]), 1, 'solo pasos a casillas vecinas'));
  console.log(`ok: ${r.total} fechas en ${r.path.length} pasos`);
  process.exit(0);
}

const result = solve(await calendar());
mkdirSync(out, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) writeFileSync(`${out}/snake-${name}.svg`, render(result, t));
console.log(`${result.total} días, ${result.path.length} pasos, largo final ${Math.min(MAX_LEN, START_LEN + result.eats.length)}`);
