// Culebrita que crece: recorre solo las fechas del calendario de contribuciones, se come los días
// con actividad y gana un segmento por cada uno. Busca el día más cercano (BFS) y antes de ir
// comprueba que después pueda seguir alcanzando su cola, para no encerrarse.
// Escribe snake-light.svg y snake-dark.svg.
// uso: GITHUB_TOKEN=... node snake.mjs <usuario> <carpeta>      autoprueba: node snake.mjs --test
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert';

const [user = 'JUNIORRDSR', out = 'dist'] = process.argv.slice(2);
const START_LEN = 3;
const MAX_LEN = 80; // ponytail: tope fijo; con muchos más días activos el tablero se llena y el solver empieza a atravesarse
const STEP = 112; // ms por casilla
const PAUSE = 2500; // ms al final: la culebrita se desvanece y todo vuelve a empezar
const PITCH = 16, CELL = 12, LEFT = 32, TOP = 22;
const TAPER = [0.5, 0.68, 0.84]; // tamaño de los tres últimos segmentos de la cola, desde la punta
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAYS = { 1: 'Lun', 3: 'Mié', 5: 'Vie' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif`;

const THEMES = {
  light: { empty: '#EBEDF0', levels: ['#FFD9C7', '#FFB08A', '#FF7F45', '#FF4F00'], snake: '#1F2328', head: '#FF4F00', text: '#59636E' },
  dark: { empty: '#161B22', levels: ['#4A2414', '#7A3415', '#C24A12', '#FF6A2B'], snake: '#E6EDF3', head: '#FF6A2B', text: '#8B949E' },
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
  const W = weeks.length;
  const board = new Set(), food = new Map();
  weeks.forEach((w, x) => w.contributionDays.forEach(d => {
    board.add(key(x, d.weekday));
    if (LEVEL[d.contributionLevel]) food.set(key(x, d.weekday), { x, y: d.weekday, level: LEVEL[d.contributionLevel] });
  }));

  // arranca vertical en la primera semana completa; snake[0] es la cabeza
  const x0 = weeks.findIndex(w => w.contributionDays.length === 7);
  let snake = Array.from({ length: START_LEN }, (_, i) => [x0, START_LEN - 1 - i]);
  const path = [...snake].reverse(); // posiciones de la cabeza en el tiempo
  const eats = []; // { step, x, y, level } — cada una alarga la culebrita
  const start = []; // fechas bajo el cuerpo inicial: se vacían al empezar, sin crecer
  for (const [x, y] of snake) if (food.has(key(x, y))) { start.push({ step: 0, x, y, ...food.get(key(x, y)) }); food.delete(key(x, y)); }
  const total = food.size; // fechas que la hacen crecer
  let collisions = 0;

  // BFS desde la cabeza que tiene en cuenta el tiempo: una casilla del cuerpo cuenta como libre
  // si ese segmento ya se habrá movido cuando la cabeza llegue (el segmento j se va en L - j pasos)
  const bfs = (body, isGoal, ignoreBody = false) => {
    const [hx, hy] = body[0], L = body.length;
    const seg = ignoreBody ? new Map() : new Map(body.map(([x, y], j) => [key(x, y), j]));
    const prev = new Map([[key(hx, hy), null]]);
    const queue = [[hx, hy, 0]];
    const goals = [];
    for (let q = 0; q < queue.length; q++) {
      const [x, y, d] = queue[q];
      if ((x !== hx || y !== hy) && isGoal(x, y)) goals.push([x, y]);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!board.has(k) || prev.has(k) || (seg.has(k) && seg.get(k) < L - (d + 1))) continue;
        prev.set(k, [x, y]);
        queue.push([nx, ny, d + 1]);
      }
    }
    const route = ([gx, gy]) => {
      const r = [];
      for (let c = [gx, gy]; c[0] !== hx || c[1] !== hy; c = prev.get(key(...c))) r.unshift(c);
      return r;
    };
    return goals.map(route); // de la más cercana a la más lejana
  };

  const simulate = (body, route) => {
    const b = body.map(c => [...c]), eaten = new Set();
    for (const [x, y] of route) {
      const k = key(x, y);
      b.unshift([x, y]);
      if (food.has(k) && !eaten.has(k) && b.length <= MAX_LEN) eaten.add(k);
      else b.pop();
    }
    return b;
  };

  const move = ([x, y]) => {
    if (snake.slice(0, -1).some(([bx, by]) => bx === x && by === y)) collisions++;
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

  const reachesTail = body => {
    const tail = body[body.length - 1];
    return bfs(body, (x, y) => x === tail[0] && y === tail[1]).length > 0;
  };
  const area = body => bfs(body, () => true).length; // casillas a las que todavía puede llegar

  let stalls = 0;
  while (food.size) {
    // cada ruta termina en la primera fecha que pisa, así no crece a mitad de camino sobre casillas que creía libres
    const routes = bfs(snake, (x, y) => food.has(key(x, y))).slice(0, 12)
      .map(r => r.slice(0, r.findIndex(([x, y]) => food.has(key(x, y))) + 1));
    // la primera ruta segura: tras comer todavía puede llegar a su cola
    let route = routes.find(r => reachesTail(simulate(snake, r)));
    if (!route && stalls++ < 600) {
      // ninguna es segura: da el paso que deja más espacio libre sin perder de vista la cola, y vuelve a planear
      const moves = DIRS.map(([dx, dy]) => [snake[0][0] + dx, snake[0][1] + dy])
        .filter(([x, y]) => board.has(key(x, y)) && !snake.slice(0, -1).some(([bx, by]) => bx === x && by === y))
        .map(c => ({ c, after: simulate(snake, [c]) }))
        .sort((a, b) => reachesTail(b.after) - reachesTail(a.after) || area(b.after) - area(a.after));
      if (moves.length) route = [moves[0].c];
    }
    route ??= routes[0] ?? bfs(snake, (x, y) => food.has(key(x, y)), true)[0]; // encerrada: atraviesa su cuerpo
    for (const c of route) move(c);
  }
  return { W, path, eats, start, total, weeks, collisions };
}

function render({ W, path, eats, start, total, weeks }, t) {
  const width = LEFT + W * PITCH + 4, barY = TOP + 7 * PITCH + 10, height = barY + 10;
  const end = (path.length - 1) * STEP, T = end + PAUSE;
  const pct = ms => (Math.min(ms, T) / T * 100).toFixed(4);
  const px = (x, y) => [LEFT + x * PITCH, TOP + y * PITCH];
  const css = [], body = [];

  // etiquetas como en el calendario de GitHub: meses arriba, Lun/Mié/Vie a la izquierda
  const text = (x, y, s, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="11" font-family="${FONT}" fill="${t.text}">${s}</text>`;
  let lastLabel = -3, lastMonth = null;
  weeks.forEach((w, x) => {
    const m = +w.contributionDays[0].date.slice(5, 7) - 1;
    if (m !== lastMonth && x - lastLabel >= 3 && (x > 0 || w.contributionDays[0].date.slice(8) <= '07')) { body.push(text(LEFT + x * PITCH, TOP - 8, MONTHS[m])); lastLabel = x; }
    lastMonth = m;
  });
  for (const [y, s] of Object.entries(DAYS)) body.push(text(LEFT - 8, TOP + y * PITCH + 10, s, 'end'));

  // casillas: las fechas con actividad se vacían en el instante en que se las come
  const eatAt = new Map([...start, ...eats].map((e, i) => [key(e.x, e.y), { ...e, i }]));
  weeks.forEach((w, x) => w.contributionDays.forEach(d => {
    const [cx, cy] = px(x, d.weekday), e = eatAt.get(key(x, d.weekday));
    const fill = e ? t.levels[e.level - 1] : t.empty;
    body.push(`<rect${e ? ` class="c${e.i}"` : ''} x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2.5" fill="${fill}"/>`);
    if (e) {
      const p = pct(e.step * STEP);
      css.push(`.c${e.i}{animation:c${e.i} ${T}ms linear infinite}@keyframes c${e.i}{0%,${p}%{fill:${fill}}${(+p + 0.01).toFixed(4)}%,100%{fill:${t.empty}}}`);
    }
  }));

  // recorrido de la cabeza: una animación que comparten todos los segmentos, cada uno con su retraso
  const frames = path.map(([x, y], j) => `${pct(j * STEP)}%{transform:translate(${px(x, y).join('px,')}px)}`);
  css.push(`@keyframes h{${frames.join('')}100%{transform:translate(${px(...path[path.length - 1]).join('px,')}px)}}`);

  // largo en cada momento: crece con cada fecha comida hasta el tope
  const growth = eats.slice(0, MAX_LEN - START_LEN).map(e => e.step * STEP);
  const maxLen = START_LEN + growth.length;
  const segs = [];
  for (let i = maxLen - 1; i >= 0; i--) { // la cabeza se dibuja encima
    let anim = `h ${T}ms linear ${(i - (START_LEN - 1)) * STEP}ms infinite both`;
    if (i >= START_LEN) { // aparece cuando se come la fecha que la hace crecer
      const p = pct(growth[i - START_LEN]);
      css.push(`@keyframes o${i}{0%,${p}%{opacity:0}${(+p + 0.01).toFixed(4)}%,100%{opacity:1}}`);
      anim += `,o${i} ${T}ms linear infinite`;
    }
    css.push(`.s${i}{animation:${anim}}`);
    let rect = `<rect x="0" y="0" width="${CELL}" height="${CELL}" rx="3" fill="${i ? t.snake : t.head}"`;
    if (i > 0) {
      // cola que se afina: el segmento se encoge mientras está entre los tres últimos y crece a medida que la culebrita se alarga
      const appear = i >= START_LEN ? growth[i - START_LEN] : 0;
      let dist = i >= START_LEN ? 0 : START_LEN - 1 - i;
      const size = d => (d < TAPER.length ? TAPER[d] : 1);
      const kf = [`0%{transform:scale(${size(dist)})}`];
      for (const g of growth) {
        if (g <= appear || dist >= TAPER.length) continue;
        kf.push(`${pct(g)}%{transform:scale(${size(dist)})}`, `${pct(g + 180)}%{transform:scale(${size(++dist)})}`);
      }
      kf.push(`100%{transform:scale(${size(dist)})}`);
      css.push(`.t${i}{transform-box:fill-box;transform-origin:center;animation:t${i} ${T}ms linear infinite}@keyframes t${i}{${kf.join('')}}`);
      rect += ` class="t${i}"`;
    }
    segs.push(`<g class="s${i}">${rect}/></g>`);
  }

  // barra de progreso: avanza un tramo por cada fecha comida
  const barW = width - LEFT - 4;
  const barFrames = ['0%{transform:scaleX(0)}'];
  eats.forEach((e, i) => {
    const p = +pct(e.step * STEP);
    barFrames.push(`${p.toFixed(4)}%{transform:scaleX(${(i / total).toFixed(4)})}${(p + 0.01).toFixed(4)}%{transform:scaleX(${((i + 1) / total).toFixed(4)})}`);
  });
  barFrames.push('100%{transform:scaleX(1)}');
  css.push(`.bar{transform-box:fill-box;transform-origin:left;animation:bar ${T}ms linear infinite}@keyframes bar{${barFrames.join('')}}`);
  body.push(`<rect x="${LEFT}" y="${barY}" width="${barW}" height="5" rx="2.5" fill="${t.empty}"/>`);
  body.push(`<rect class="bar" x="${LEFT}" y="${barY}" width="${barW}" height="5" rx="2.5" fill="${t.head}"/>`);

  // aparece al empezar y se desvanece en la pausa final, antes de repetir
  css.push(`.sn{animation:sn ${T}ms linear infinite}@keyframes sn{0%{opacity:0}${pct(300)}%,${pct(end + 400)}%{opacity:1}${pct(end + 1100)}%,100%{opacity:0}}`);
  body.push(`<g class="sn">${segs.join('')}</g>`);

  css.push('@media (prefers-reduced-motion:reduce){.sn{display:none}rect{animation:none!important}}');
  const label = `Una culebrita recorre el calendario de contribuciones, se come los ${start.length + total} días con actividad y crece con cada uno`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><title>${label}</title><style>${css.join('')}</style>${body.join('')}</svg>\n`;
}

if (process.argv.includes('--test')) { // autoprueba con un calendario sintético muy activo
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
  const day0 = Date.UTC(2025, 9, 5);
  const weeks = Array.from({ length: 53 }, (_, w) => ({
    contributionDays: Array.from({ length: w === 52 ? 4 : 7 }, (_, d) => ({
      weekday: d, date: new Date(day0 + (w * 7 + d) * 864e5).toISOString().slice(0, 10),
      contributionLevel: levels[rand() < 0.75 ? 0 : 1 + Math.floor(rand() * 4)],
    })),
  }));
  const r = solve(weeks);
  assert.equal(r.eats.length + r.start.length, weeks.flatMap(w => w.contributionDays).filter(d => d.contributionLevel !== 'NONE').length, 'se come todas las fechas');
  r.path.slice(1).forEach(([x, y], i) => assert.equal(Math.abs(x - r.path[i][0]) + Math.abs(y - r.path[i][1]), 1, 'solo pasos a casillas vecinas'));
  const days = new Set(weeks.flatMap((w, x) => w.contributionDays.map(d => key(x, d.weekday))));
  r.path.forEach(([x, y]) => assert.ok(days.has(key(x, y)), 'nunca sale del calendario'));
  assert.equal(r.collisions, 0, 'no choca consigo misma');
  render(r, THEMES.light);
  console.log(`ok: ${r.total} fechas en ${r.path.length} pasos, sin choques`);
  process.exit(0);
}

const result = solve(await calendar());
mkdirSync(out, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) writeFileSync(`${out}/snake-${name}.svg`, render(result, t));
console.log(`${result.start.length + result.total} días, ${result.path.length} pasos, largo final ${Math.min(MAX_LEN, START_LEN + result.eats.length)}, choques ${result.collisions}`);
