/**
 * Apresentação institucional — Ácido Hipocloroso (HClO)
 * Gera: Acido-Hipocloroso-Apresentacao.pptx
 *
 * Uso:  NODE_PATH=<pasta com node_modules> node gerar_apresentacao.js
 */

const path = require("path");
const fs = require("fs");
const JSZip = require("jszip");
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
const Fi = require("react-icons/fi");
const Md = require("react-icons/md");

/* ─────────────────────────── SISTEMA DE DESIGN ─────────────────────────── */

const C = {
  deep: "06282F", // fundo escuro (petróleo)
  panel: "0C3A45", // cartão sobre fundo escuro
  teal: "028090", // primária
  seafoam: "00A896",
  mint: "02C39A", // acento
  white: "FFFFFF",
  soft: "F1F7F8", // fundo claro alternativo
  tint: "E7F2F3", // preenchimento de cartão claro
  ink: "10262C", // texto principal
  muted: "5E7A81", // texto secundário
  onDark: "BCD6DA", // texto secundário sobre escuro
};

const F = { head: "Arial", body: "Calibri" };

const M = 0.75; // margem lateral
const W = 13.333;
const H = 7.5;
const CW = W - M * 2; // largura útil = 11.833

const cols = (n, gap) => {
  const w = (CW - gap * (n - 1)) / n;
  return { w, x: (i) => M + i * (w + gap) };
};

const shadow = (o = {}) => ({
  type: "outer",
  color: o.color || "0B3A44",
  blur: o.blur || 14,
  offset: o.offset === undefined ? 3 : o.offset,
  angle: 90,
  opacity: o.opacity || 0.1,
});

/* ───────────────────────────── ÍCONES (PNG) ────────────────────────────── */

const ICON_SET = {
  droplet: Fi.FiDroplet,
  shield: Fi.FiShield,
  eye: Fi.FiEye,
  heart: Fi.FiHeart,
  feather: Fi.FiFeather,
  check: Fi.FiCheckCircle,
  layers: Fi.FiLayers,
  clock: Fi.FiClock,
  refresh: Fi.FiRefreshCw,
  wind: Fi.FiWind,
  users: Fi.FiUsers,
  star: Fi.FiStar,
  home: Fi.FiHome,
  activity: Fi.FiActivity,
  zap: Fi.FiZap,
  award: Fi.FiAward,
  alert: Fi.FiAlertCircle,
  trending: Fi.FiTrendingUp,
  virus: Md.MdCoronavirus,
  bio: Md.MdBiotech,
};

/* ────────────────────────── LOGO DA MARCA (RODAPÉ) ──────────────────────────
 * Coloque o arquivo do logo nesta pasta como "logo-nebutech.<ext>".
 * Formatos aceitos: svg (ideal — vetorial), png, webp, jpg.
 *
 * Se a imagem for de baixa resolução (print de tela), ela é reamostrada para
 * 1600 px de largura com Lanczos e recebe uma máscara de nitidez leve. Isso
 * apenas aumenta a definição: nenhuma cor, proporção ou elemento é alterado.
 * Sem o arquivo, o rodapé continua sendo a linha de texto original.
 */

const LOGO_ARQS = [
  "logo-nebutech.svg",
  "logo-nebutech.png",
  "logo-nebutech.webp",
  "logo-nebutech.jpg",
  "logo-nebutech.jpeg",
];
const LOGO_LARGURA_ALVO = 1600; // px de trabalho para o logo ficar nítido
let LOGO = null; // { data, ratio }

async function prepararLogo() {
  const arq = LOGO_ARQS.map((f) => path.join(__dirname, f)).find((f) => fs.existsSync(f));
  if (!arq) {
    console.warn("• Logo não encontrado — rodapé permanece em texto.");
    console.warn("  Salve o arquivo como apresentacao/logo-nebutech.png (ou .svg) e rode de novo.");
    return;
  }

  const meta = await sharp(arq).metadata();
  let pipe = sharp(arq, { density: 600 }); // density só afeta a rasterização de SVG

  if (meta.width && meta.width < LOGO_LARGURA_ALVO) {
    pipe = pipe
      .resize({ width: LOGO_LARGURA_ALVO, kernel: "lanczos3" })
      .sharpen({ sigma: 0.9, m1: 0.5, m2: 2.5 }); // máscara de nitidez suave
  }

  const buf = await pipe.png().toBuffer();
  const fin = await sharp(buf).metadata();
  LOGO = { data: "image/png;base64," + buf.toString("base64"), ratio: fin.height / fin.width };
  console.log(
    `• Logo: ${path.basename(arq)} ${meta.width}×${meta.height} → ${fin.width}×${fin.height}px`
  );
}

const ICONS = {}; // "nome@COR" -> base64

async function buildIcons(colors) {
  for (const [name, Comp] of Object.entries(ICON_SET)) {
    for (const hex of colors) {
      const svg = renderToStaticMarkup(
        React.createElement(Comp, { size: 320, color: "#" + hex })
      );
      const png = await sharp(Buffer.from(svg)).resize(320, 320).png().toBuffer();
      ICONS[`${name}@${hex}`] = "image/png;base64," + png.toString("base64");
    }
  }
}

const ico = (name, hex) => {
  const k = `${name}@${hex}`;
  if (!ICONS[k]) throw new Error("Ícone não gerado: " + k);
  return ICONS[k];
};

/* ─────────────────────────────── APRESENTAÇÃO ──────────────────────────── */

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Bandeira Soluções";
pres.company = "Bandeira Soluções";
pres.title = "Ácido Hipocloroso (HClO) — Guia Técnico e Comercial";

/* ─────────────────── ANIMAÇÃO: registro de "ondas" de entrada ───────────────
 * pptxgenjs não gera transições nem animações. Registramos, para cada forma
 * adicionada, o número da onda em que ela deve entrar; o pós-processamento no
 * final do arquivo injeta o XML de <p:transition> e <p:timing> no .pptx.
 *
 *   onda 0  → sem animação (aparece junto com o slide: rodapé, numeração)
 *   onda N  → entra com atraso (N-1) × STAGGER
 * Elementos adicionados dentro de um mesmo group() compartilham a onda.
 */

const SLIDES = [];
let WAVE = 0;
let DEPTH = 0;
let STILL = false;

function newSlide() {
  const s = pres.addSlide();
  s._waves = [];
  WAVE = 0;
  DEPTH = 0;
  SLIDES.push(s);
  ["addText", "addShape", "addImage"].forEach((m) => {
    const orig = s[m].bind(s);
    s[m] = (...args) => {
      if (!STILL && DEPTH === 0) WAVE++;
      s._waves.push(STILL ? 0 : WAVE);
      return orig(...args);
    };
  });
  return s;
}

// agrupa vários elementos numa única onda de animação
function group(fn) {
  if (DEPTH === 0) WAVE++;
  DEPTH++;
  try {
    return fn();
  } finally {
    DEPTH--;
  }
}

// elementos fixos, sem animação
function still(fn) {
  STILL = true;
  try {
    return fn();
  } finally {
    STILL = false;
  }
}

/* helpers de composição ---------------------------------------------------- */

function iconCircle(s, o) {
  return group(() => iconCircleRaw(s, o));
}

function iconCircleRaw(s, { x, y, d, fill, icon, color, pad = 0.27 }) {
  s.addShape(pres.ShapeType.ellipse, {
    x,
    y,
    w: d,
    h: d,
    fill: { color: fill },
    line: { type: "none" },
  });
  const p = d * pad;
  s.addImage({ data: ico(icon, color), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p });
}

function numberBadge(s, o) {
  return group(() => numberBadgeRaw(s, o));
}

function numberBadgeRaw(s, { x, y, d, n, fill, color }) {
  s.addShape(pres.ShapeType.ellipse, {
    x,
    y,
    w: d,
    h: d,
    fill: { color },
    line: { type: "none" },
  });
  s.addText(n, {
    x,
    y,
    w: d,
    h: d,
    align: "center",
    valign: "middle",
    fontFace: F.head,
    fontSize: 14,
    bold: true,
    color: fill,
    margin: 0,
  });
}

function eyebrow(s, text, { y = 0.72, color = C.teal } = {}) {
  s.addText(text.toUpperCase(), {
    x: M,
    y,
    w: CW,
    h: 0.26,
    fontFace: F.head,
    fontSize: 10.5,
    bold: true,
    charSpacing: 2.6,
    color,
    margin: 0,
    valign: "middle",
  });
}

function title(s, text, { y = 1.04, w = CW, color = C.ink, size = 34, h = 1.1 } = {}) {
  s.addText(text, {
    x: M,
    y,
    w,
    h,
    fontFace: F.head,
    fontSize: size,
    bold: true,
    color,
    charSpacing: -0.4,
    lineSpacing: size * 1.16,
    margin: 0,
    valign: "top",
  });
}

function lead(s, text, { y, w = 9.6, color = C.muted, size = 15 } = {}) {
  s.addText(text, {
    x: M,
    y,
    w,
    h: 0.85,
    fontFace: F.body,
    fontSize: size,
    color,
    lineSpacing: size * 1.4,
    margin: 0,
    valign: "top",
  });
}

function footer(s, n, opts = {}) {
  return still(() => footerRaw(s, n, opts));
}

/* Caixa do logo no rodapé: o arquivo é encaixado dentro dela preservando a
 * proporção, e alinhado pela base. Assim qualquer versão do logo (horizontal,
 * quadrada ou empilhada) cabe na faixa sem colidir com o conteúdo acima. */
const LOGO_W_MAX = 1.35; // largura máxima (pol)
const LOGO_H_MAX = 0.5; // altura máxima (pol)
const LOGO_BASE = 7.23; // borda inferior do logo — centraliza com a numeração

function caixaLogo() {
  const w = Math.min(LOGO_W_MAX, LOGO_H_MAX / LOGO.ratio);
  const h = w * LOGO.ratio;
  return { w, h, y: LOGO_BASE - h };
}

// Marca no rodapé. Em fundo escuro o logo vai sobre uma placa branca, para
// preservar as cores originais da marca sem precisar de uma versão invertida.
function marca(s, { x, y, w, dark }) {
  const h = w * LOGO.ratio;
  const pad = 0.13;
  if (dark) {
    s.addShape(pres.ShapeType.roundRect, {
      x: x - pad,
      y: y - pad * 0.8,
      w: w + pad * 2,
      h: h + pad * 1.6,
      rectRadius: 0.06,
      fill: { color: C.white },
      line: { type: "none" },
    });
  }
  s.addImage({ data: LOGO.data, x, y, w, h });
  return h;
}

function footerRaw(s, n, { dark = false } = {}) {
  if (LOGO) {
    const b = caixaLogo();
    marca(s, { x: M, y: b.y, w: b.w, dark });
  } else {
    s.addText("Ácido Hipocloroso · Guia técnico e comercial", {
      x: M,
      y: 6.86,
      w: 5,
      h: 0.3,
      fontFace: F.body,
      fontSize: 9.5,
      color: dark ? "6E9199" : C.muted,
      margin: 0,
      valign: "middle",
    });
  }
  s.addText(String(n).padStart(2, "0"), {
    x: W - M - 1,
    y: 6.86,
    w: 1,
    h: 0.3,
    align: "right",
    fontFace: F.head,
    fontSize: 10,
    bold: true,
    color: dark ? C.mint : C.teal,
    margin: 0,
    valign: "middle",
  });
}

// Cartão com ícone no topo, título e texto
function iconCard(s, o) {
  return group(() => iconCardRaw(s, o));
}

function iconCardRaw(s, o) {
  const dark = !!o.dark;
  s.addShape(pres.ShapeType.roundRect, {
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    rectRadius: 0.1,
    fill: { color: dark ? C.panel : o.fill || C.white },
    line: dark ? { type: "none" } : { color: "DCE9EB", width: 1 },
    shadow: dark ? undefined : shadow(),
  });
  const pad = 0.34;
  iconCircle(s, {
    x: o.x + pad,
    y: o.y + pad,
    d: 0.62,
    fill: dark ? C.mint : C.tint,
    icon: o.icon,
    color: dark ? C.deep : C.teal,
  });
  s.addText(o.title, {
    x: o.x + pad,
    y: o.y + pad + 0.82,
    w: o.w - pad * 2,
    h: 0.62,
    fontFace: F.head,
    fontSize: 15,
    bold: true,
    color: dark ? C.white : C.ink,
    lineSpacing: 18,
    margin: 0,
    valign: "top",
  });
  s.addText(o.body, {
    x: o.x + pad,
    y: o.y + pad + 1.5,
    w: o.w - pad * 2,
    h: o.h - pad * 2 - 1.5,
    fontFace: F.body,
    fontSize: 12.5,
    color: dark ? C.onDark : C.muted,
    lineSpacing: 17,
    margin: 0,
    valign: "top",
  });
}

// Linha ícone + texto (layout horizontal)
function iconRow(s, o) {
  return group(() => iconRowRaw(s, o));
}

function iconRowRaw(s, o) {
  iconCircle(s, {
    x: o.x,
    y: o.y,
    d: 0.66,
    fill: o.circle || C.tint,
    icon: o.icon,
    color: o.iconColor || C.teal,
  });
  const tx = o.x + 0.92;
  const tw = o.w - 0.92;
  s.addText(o.title, {
    x: tx,
    y: o.y - 0.02,
    w: tw,
    h: 0.34,
    fontFace: F.head,
    fontSize: 15,
    bold: true,
    color: o.dark ? C.white : C.ink,
    margin: 0,
    valign: "middle",
  });
  s.addText(o.body, {
    x: tx,
    y: o.y + 0.38,
    w: tw,
    h: 0.9,
    fontFace: F.body,
    fontSize: 12.5,
    color: o.dark ? C.onDark : C.muted,
    lineSpacing: 17,
    margin: 0,
    valign: "top",
  });
}

function chip(s, o) {
  return group(() => chipRaw(s, o));
}

function chipRaw(s, o) {
  s.addShape(pres.ShapeType.roundRect, {
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h || 0.42,
    rectRadius: 0.2,
    fill: o.fill ? { color: o.fill } : { color: C.deep, transparency: 100 },
    line: { color: o.line || C.mint, width: 1 },
  });
  s.addText(o.text, {
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h || 0.42,
    align: "center",
    valign: "middle",
    fontFace: o.font || F.body,
    fontSize: o.size || 12,
    bold: true,
    color: o.color || C.white,
    margin: 0,
  });
}

function buildSlides() {

/* ─────────────────────────────── 01 · CAPA ─────────────────────────────── */
{
  const s = newSlide();
  s.background = { color: C.deep };

  // composição decorativa (motivo circular)
  group(() => {
    s.addShape(pres.ShapeType.ellipse, {
      x: 8.0, y: 0.55, w: 6.4, h: 6.4,
      fill: { color: C.teal, transparency: 86 }, line: { type: "none" },
    });
    s.addShape(pres.ShapeType.ellipse, {
      x: 8.85, y: 1.4, w: 4.7, h: 4.7,
      fill: { color: C.teal, transparency: 74 }, line: { color: C.seafoam, width: 1.25 },
    });
    s.addShape(pres.ShapeType.ellipse, {
      x: 9.85, y: 2.4, w: 2.7, h: 2.7,
      fill: { color: C.mint, transparency: 88 }, line: { type: "none" },
    });
    s.addImage({ data: ico("droplet", C.mint), x: 10.53, y: 3.08, w: 1.34, h: 1.34 });
  });

  chip(s, { x: M, y: 1.35, w: 1.2, h: 0.4, text: "HClO", fill: C.mint, line: C.mint, color: C.deep, size: 13, font: "Cambria" });
  s.addText("GUIA TÉCNICO E COMERCIAL", {
    x: M + 1.34, y: 1.35, w: 5, h: 0.4,
    fontFace: F.head, fontSize: 10.5, bold: true, charSpacing: 2.6,
    color: C.mint, margin: 0, valign: "middle",
  });

  s.addText("Ácido\nHipocloroso", {
    x: M, y: 2.02, w: 7.4, h: 2.2,
    fontFace: F.head, fontSize: 54, bold: true, color: C.white,
    charSpacing: -1, lineSpacing: 60, margin: 0, valign: "top",
  });

  s.addText(
    "O desinfetante de uso geral que higieniza com alto poder de ação — e ainda respeita a pele, os olhos e as superfícies.",
    {
      x: M, y: 4.42, w: 6.7, h: 1.0,
      fontFace: F.body, fontSize: 17, color: C.onDark, lineSpacing: 25, margin: 0, valign: "top",
    }
  );

  ["Seguro", "Eficaz", "Uso diário"].forEach((t, i) => {
    chip(s, { x: M + i * 1.86, y: 5.72, w: 1.7, h: 0.44, text: t, line: "2C6672", color: C.onDark, size: 11.5 });
  });

  // Na capa a marca aparece maior; sem o arquivo, mantém-se a linha de crédito.
  still(() => {
    if (LOGO) {
      const b = caixaLogo();
      marca(s, { x: M, y: b.y, w: b.w, dark: true });
    } else {
      s.addText("Bandeira Soluções · Guia do Ácido Hipocloroso", {
        x: M, y: 6.86, w: 8, h: 0.3,
        fontFace: F.body, fontSize: 10, color: "6E9199", margin: 0, valign: "middle",
      });
    }
  });
  s.addNotes(
    "Abertura. Posicionar o HClO como um desinfetante de uso geral, seguro e eficaz — o único antisséptico que respeita a pele e os olhos."
  );
}

/* ────────────────────────────── 02 · AGENDA ────────────────────────────── */
{
  const s = newSlide();
  s.background = { color: C.white };
  eyebrow(s, "Agenda");
  title(s, "O que você vai encontrar neste guia");
  lead(
    s,
    "Um material feito para ajudar você a entender a tecnologia por trás do ácido hipocloroso — e a confiar nesse aliado no cuidado diário.",
    { y: 2.02, w: 9.4 }
  );

  const items = [
    ["O que é o ácido hipocloroso", "Definição, composição e para que serve"],
    ["Uma defesa que o corpo já produz", "A origem natural da molécula"],
    ["Higienizar não é desinfetar", "A diferença que muda o resultado"],
    ["Segurança para o uso diário", "Pele, olhos, bebês e superfícies"],
    ["Espectro de ação comprovado", "Vírus e bactérias combatidos"],
    ["Catálogo técnico e aplicações", "Ativo, tempo de ação, duração e uso"],
  ];
  const g = cols(2, 0.7);
  items.forEach((it, i) => {
    const c = i % 2;
    const r = Math.floor(i / 2);
    const x = g.x(c);
    const y = 3.12 + r * 1.22;
    group(() => {
      numberBadge(s, { x, y, d: 0.6, n: String(i + 1), fill: C.white, color: C.teal });
      s.addText(it[0], {
        x: x + 0.86, y: y - 0.02, w: g.w - 0.86, h: 0.34,
        fontFace: F.head, fontSize: 15, bold: true, color: C.ink, margin: 0, valign: "middle",
      });
      s.addText(it[1], {
        x: x + 0.86, y: y + 0.34, w: g.w - 0.86, h: 0.32,
        fontFace: F.body, fontSize: 12.5, color: C.muted, margin: 0, valign: "middle",
      });
    });
  });

  footer(s, 2);
  s.addNotes("Roteiro da apresentação. Reforçar que o guia foi criado para gerar confiança com informação técnica.");
}

/* ───────────────────────────── 03 · O QUE É ────────────────────────────── */
{
  const s = newSlide();
  s.background = { color: C.white };
  eyebrow(s, "Definição");
  title(s, "Um desinfetante de uso geral — seguro e eficaz");
  lead(
    s,
    "O HClO é o único antisséptico que respeita a pele e os olhos. Combate germes, vírus e bactérias sem atacar a superfície tratada — por isso é indicado até para higienizar as mãos dos bebês desde o nascimento.",
    { y: 2.05, w: 10.2 }
  );

  const g = cols(3, 0.4);
  const cards = [
    ["shield", "Desinfecção de alto poder", "Age contra germes, vírus e bactérias em superfícies, objetos e pele — muito além da higienização comum."],
    ["eye", "Respeita pele e olhos", "Não irrita e não resseca. Pode ser usado no rosto, nas mãos e ao redor dos olhos, todos os dias."],
    ["heart", "Seguro desde o nascimento", "Indicado para higienizar as mãos dos bebês desde os primeiros dias de vida."],
  ];
  cards.forEach((c, i) =>
    iconCard(s, { x: g.x(i), y: 3.3, w: g.w, h: 3.05, icon: c[0], title: c[1], body: c[2] })
  );

  footer(s, 3);
  s.addNotes("Definição objetiva. O ponto central: eficácia de desinfetante com segurança de produto de cuidado pessoal.");
}

/* ─────────────────────── 04 · DEFESA NATURAL (DARK) ────────────────────── */
{
  const s = newSlide();
  s.background = { color: C.deep };
  s.addShape(pres.ShapeType.ellipse, {
    x: 10.6, y: -1.5, w: 5.2, h: 5.2,
    fill: { color: C.teal, transparency: 88 }, line: { type: "none" },
  });

  eyebrow(s, "Origem", { color: C.mint });
  title(s, "Uma tecnologia que o seu corpo já usa", { color: C.white });
  lead(
    s,
    "Um nome que quase ninguém conhece — e uma substância mais comum do que se imagina. O ácido hipocloroso é produzido pelo nosso próprio organismo quando entramos em estado de alerta contra vírus e bactérias.",
    { y: 2.05, w: 9.8, color: C.onDark }
  );

  const steps = [
    ["Ameaça detectada", "Vírus e bactérias entram em contato com o organismo."],
    ["Estado de alerta", "O sistema de defesa é acionado imediatamente."],
    ["Produção de HClO", "As células de defesa liberam o ácido hipocloroso."],
    ["Neutralização", "Os microrganismos são eliminados sem agredir o tecido."],
  ];
  const g = cols(4, 0.35);
  steps.forEach((st, i) => {
    const x = g.x(i);
    group(() => {
      s.addShape(pres.ShapeType.roundRect, {
        x, y: 3.4, w: g.w, h: 2.25, rectRadius: 0.1,
        fill: { color: C.panel }, line: { type: "none" },
      });
      numberBadge(s, { x: x + 0.32, y: 3.72, d: 0.52, n: String(i + 1), fill: C.deep, color: C.mint });
      s.addText(st[0], {
        x: x + 0.32, y: 4.42, w: g.w - 0.64, h: 0.32,
        fontFace: F.head, fontSize: 14, bold: true, color: C.white, margin: 0, valign: "middle",
      });
      s.addText(st[1], {
        x: x + 0.32, y: 4.78, w: g.w - 0.64, h: 0.72,
        fontFace: F.body, fontSize: 12, color: C.onDark, lineSpacing: 16, margin: 0, valign: "top",
      });
    });
  });

  s.addText(
    "É a mesma molécula da nossa defesa natural — agora estabilizada e pronta para o uso diário.",
    {
      x: M, y: 5.95, w: CW, h: 0.4,
      fontFace: F.body, fontSize: 14, italic: true, color: C.mint, margin: 0, valign: "middle",
    }
  );

  footer(s, 4, { dark: true });
  s.addNotes("Argumento de confiança: não é uma química estranha ao corpo — é a molécula que o próprio organismo produz.");
}

/* ─────────────────── 05 · HIGIENIZAR × DESINFETAR (LIGHT) ──────────────── */
{
  const s = newSlide();
  s.background = { color: C.soft };
  eyebrow(s, "Conceito");
  title(s, "Higienizar não é desinfetar");
  lead(
    s,
    "Vivemos em estado de alerta e, quando o assunto é higiene, limpar já não basta. O ácido hipocloroso age em outro nível: mais que higienizar, ele desinfeta.",
    { y: 2.05, w: 9.8 }
  );

  const g = cols(2, 0.5);

  // Coluna 1 — Higienizar
  group(() => {
  s.addShape(pres.ShapeType.roundRect, {
    x: g.x(0), y: 3.15, w: g.w, h: 2.95, rectRadius: 0.1,
    fill: { color: C.white }, line: { color: "DCE9EB", width: 1 }, shadow: shadow(),
  });
  iconCircle(s, { x: g.x(0) + 0.42, y: 3.52, d: 0.62, fill: C.tint, icon: "layers", color: C.muted });
  s.addText("Higienizar", {
    x: g.x(0) + 1.2, y: 3.52, w: 3.5, h: 0.62,
    fontFace: F.head, fontSize: 21, bold: true, color: C.ink, margin: 0, valign: "middle",
  });
  s.addText(
    [
      { text: "Reduz a sujeira aparente da superfície", options: { bullet: true, breakLine: true } },
      { text: "Remove resíduos, gordura e poeira", options: { bullet: true, breakLine: true } },
      { text: "Não garante a eliminação de microrganismos", options: { bullet: true, breakLine: true } },
      { text: "Exige um segundo produto para desinfetar", options: { bullet: true } },
    ],
    {
      x: g.x(0) + 0.44, y: 4.42, w: g.w - 0.88, h: 1.5,
      fontFace: F.body, fontSize: 13.5, color: C.muted, paraSpaceAfter: 8, margin: 0, valign: "top",
    }
  );
  });

  // Coluna 2 — Desinfetar (destaque)
  group(() => {
  s.addShape(pres.ShapeType.roundRect, {
    x: g.x(1), y: 3.15, w: g.w, h: 2.95, rectRadius: 0.1,
    fill: { color: C.teal }, line: { type: "none" }, shadow: shadow({ opacity: 0.16 }),
  });
  iconCircle(s, { x: g.x(1) + 0.42, y: 3.52, d: 0.62, fill: C.mint, icon: "shield", color: C.deep });
  s.addText("Desinfetar", {
    x: g.x(1) + 1.2, y: 3.52, w: 3.5, h: 0.62,
    fontFace: F.head, fontSize: 21, bold: true, color: C.white, margin: 0, valign: "middle",
  });
  s.addText(
    [
      { text: "Elimina vírus, germes e bactérias", options: { bullet: true, breakLine: true } },
      { text: "Age onde o olho não vê", options: { bullet: true, breakLine: true } },
      { text: "Protege sem agredir o material tratado", options: { bullet: true, breakLine: true } },
      { text: "Um só produto para pele, objetos e ambientes", options: { bullet: true } },
    ],
    {
      x: g.x(1) + 0.44, y: 4.42, w: g.w - 0.88, h: 1.5,
      fontFace: F.body, fontSize: 13.5, color: "DCF2F0", paraSpaceAfter: 8, margin: 0, valign: "top",
    }
  );
  });

  footer(s, 5);
  s.addNotes("Diferenciar os dois conceitos é o que justifica a troca de produto. Higienização remove; desinfecção elimina.");
}

/* ──────────────────────────── 06 · SEGURANÇA ───────────────────────────── */
{
  const s = newSlide();
  s.background = { color: C.white };
  eyebrow(s, "Segurança");
  title(s, "Proteção sem os efeitos colaterais\nda química agressiva", { h: 1.6 });
  lead(
    s,
    "O melhor é saber que você está se protegendo sem o uso de substâncias que irritam e causam alergias — com um produto que segue normas rígidas de qualidade.",
    { y: 2.62, w: 10.2 }
  );

  const rows = [
    ["feather", "Sem substâncias irritantes", "Nada de agentes agressivos que ressecam, ardem ou desencadeiam reações alérgicas."],
    ["check", "Normas rígidas de qualidade", "Produção controlada e padronizada, do ativo ao envase, com rastreabilidade."],
    ["eye", "Seguro em áreas sensíveis", "Pode ser aplicado no rosto, ao redor dos olhos e nas mãos — inclusive nas dos bebês."],
    ["layers", "Não agride superfícies", "Higieniza sem manchar, corroer ou comprometer o material tratado."],
  ];
  const g = cols(2, 0.7);
  rows.forEach((r, i) => {
    const c = i % 2;
    const rw = Math.floor(i / 2);
    iconRow(s, { x: g.x(c), y: 3.72 + rw * 1.5, w: g.w, icon: r[0], title: r[1], body: r[2] });
  });

  footer(s, 6);
  s.addNotes("Quebra de objeção: segurança é o principal motivo de troca por quem tem criança, pet ou pele sensível.");
}

/* ──────────────────── 07 · ESPECTRO DE AÇÃO (DARK) ─────────────────────── */
{
  const s = newSlide();
  s.background = { color: C.deep };
  s.addShape(pres.ShapeType.ellipse, {
    x: -1.6, y: 4.4, w: 4.6, h: 4.6,
    fill: { color: C.teal, transparency: 88 }, line: { type: "none" },
  });

  eyebrow(s, "Eficácia", { color: C.mint });
  title(s, "Alto poder de desinfecção comprovado", { color: C.white });
  lead(
    s,
    "O principal diferencial: um ativo orgânico com desempenho de desinfetante profissional contra os agentes que mais preocupam.",
    { y: 2.05, w: 9.4, color: C.onDark }
  );

  const g = cols(2, 0.5);
  const blocks = [
    ["virus", "Vírus", ["H1N1", "H5N1", "SARS-CoV-2 (Covid-19)"]],
    ["bio", "Bactérias", ["Salmonella enterica", "Escherichia coli"]],
  ];
  blocks.forEach((b, i) => {
    const x = g.x(i);
    group(() => {
      s.addShape(pres.ShapeType.roundRect, {
        x, y: 3.2, w: g.w, h: 3.0, rectRadius: 0.1,
        fill: { color: C.panel }, line: { type: "none" },
      });
      iconCircle(s, { x: x + 0.42, y: 3.55, d: 0.66, fill: C.mint, icon: b[0], color: C.deep });
      s.addText(b[1], {
        x: x + 1.22, y: 3.55, w: 3.5, h: 0.66,
        fontFace: F.head, fontSize: 21, bold: true, color: C.white, margin: 0, valign: "middle",
      });
    });
    b[2].forEach((t, j) => {
      chip(s, {
        x: x + 0.44, y: 4.42 + j * 0.56, w: g.w - 0.88, h: 0.46,
        text: t, line: "2C6672", color: C.white, size: 12.5,
      });
    });
  });

  s.addText("Ação comprovada contra vírus envelopados e bactérias de alta relevância sanitária.", {
    x: M, y: 6.22, w: CW, h: 0.32,
    fontFace: F.body, fontSize: 13, italic: true, color: C.mint, margin: 0, valign: "middle",
  });

  footer(s, 7, { dark: true });
  s.addNotes("Slide de prova. Citar os agentes pelo nome técnico transmite credibilidade em reuniões B2B.");
}

/* ───────────────────────── 08 · APLICAÇÕES (LIGHT) ─────────────────────── */
{
  const s = newSlide();
  s.background = { color: C.white };
  eyebrow(s, "Aplicações");
  title(s, "Onde o ácido hipocloroso já é protagonista");
  lead(
    s,
    "Utilizado no mercado da beleza, hoje é protagonista nas rotinas de skincare, um segredo dos dermatologistas — e virou braço direito das empresas que priorizam produtos de qualidade.",
    { y: 2.05, w: 10.4 }
  );

  const g = cols(4, 0.35);
  const items = [
    ["star", "Mercado da beleza", "Presente nas rotinas de skincare e na estética profissional."],
    ["award", "Segredo dos dermatologistas", "Higieniza a pele sem atacar a barreira cutânea."],
    ["users", "Empresas e ambientes", "Braço direito de negócios que priorizam qualidade."],
    ["home", "Cuidado diário em casa", "Mãos, objetos, brinquedos e superfícies da família."],
  ];
  items.forEach((it, i) =>
    iconCard(s, { x: g.x(i), y: 3.3, w: g.w, h: 3.05, icon: it[0], title: it[1], body: it[2] })
  );

  footer(s, 8);
  s.addNotes("Prova social por segmento. Ajustar a ordem conforme o público da reunião (B2C beleza ou B2B operação).");
}

/* ───────────────────── 09 · ESCOLHA DAS EMPRESAS (SOFT) ────────────────── */
{
  const s = newSlide();
  s.background = { color: C.soft };
  eyebrow(s, "Mercado");
  title(s, "Por que empresas práticas já fizeram a troca");
  lead(
    s,
    "Elas encontraram nessa higienização uma alternativa para manter tudo limpo e desinfetado, sem receio de agredir as superfícies.",
    { y: 2.02, w: 9.8 }
  );

  const g = cols(4, 0.35);
  const pillars = [
    ["zap", "Mais rápida", "Ação imediata, sem etapas extras."],
    ["shield", "Mais segura", "Sem risco para quem aplica e convive."],
    ["trending", "Mais inteligente", "Um produto para pele, objetos e ambientes."],
    ["check", "Mais eficaz", "Desinfecção real, não apenas limpeza."],
  ];
  pillars.forEach((p, i) => {
    const x = g.x(i);
    group(() => {
      s.addShape(pres.ShapeType.roundRect, {
        x, y: 3.05, w: g.w, h: 2.05, rectRadius: 0.1,
        fill: { color: C.white }, line: { color: "DCE9EB", width: 1 }, shadow: shadow(),
      });
      iconCircle(s, { x: x + 0.32, y: 3.3, d: 0.58, fill: C.tint, icon: p[0], color: C.teal });
      s.addText(p[1], {
        x: x + 0.32, y: 3.98, w: g.w - 0.64, h: 0.32,
        fontFace: F.head, fontSize: 16.5, bold: true, color: C.ink, margin: 0, valign: "middle",
      });
      s.addText(p[2], {
        x: x + 0.32, y: 4.32, w: g.w - 0.64, h: 0.62,
        fontFace: F.body, fontSize: 12, color: C.muted, lineSpacing: 15, margin: 0, valign: "top",
      });
    });
  });

  // faixa de destaque
  group(() => {
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 5.4, w: CW, h: 1.16, rectRadius: 0.1,
    fill: { color: C.deep }, line: { type: "none" },
  });
  iconCircle(s, { x: M + 0.4, y: 5.67, d: 0.62, fill: C.mint, icon: "droplet", color: C.deep });
  s.addText(
    [
      { text: "O diferencial: ", options: { bold: true, color: C.mint } },
      { text: "um ativo orgânico com poder de desinfetante — limpa, higieniza e desinfeta sem receio de agredir as superfícies.", options: { color: C.white } },
    ],
    {
      x: M + 1.2, y: 5.4, w: CW - 1.6, h: 1.16,
      fontFace: F.body, fontSize: 14.5, lineSpacing: 20, margin: 0, valign: "middle",
    }
  );
  });

  footer(s, 9);
  s.addNotes("Slide comercial. Usar quando o interlocutor for gestor de operação, limpeza ou compras.");
}

/* ───────────────────────── 10 · CATÁLOGO TÉCNICO ───────────────────────── */
{
  const s = newSlide();
  s.background = { color: C.white };
  eyebrow(s, "Catálogo técnico");
  title(s, "A ficha técnica em quatro eixos");
  lead(
    s,
    "Para você entender a tecnologia por trás do ácido hipocloroso, o catálogo técnico reúne as informações essenciais do produto.",
    { y: 2.05, w: 9.8 }
  );

  const g = cols(2, 0.5);
  const specs = [
    ["droplet", "Principal ativo", "Ácido hipocloroso (HClO), em concentração definida na ficha técnica do produto."],
    ["clock", "Tempo de ação", "Quanto tempo o produto leva para neutralizar os microrganismos após a aplicação."],
    ["refresh", "Duração", "Por quanto tempo a proteção permanece ativa e qual a validade após a abertura."],
    ["wind", "Modo de aplicar", "Como e onde aplicar em pele, mãos, objetos, tecidos e superfícies."],
  ];
  specs.forEach((sp, i) => {
    const c = i % 2;
    const r = Math.floor(i / 2);
    const x = g.x(c);
    const y = 3.15 + r * 1.62;
    group(() => {
      s.addShape(pres.ShapeType.roundRect, {
        x, y, w: g.w, h: 1.38, rectRadius: 0.1,
        fill: { color: C.soft }, line: { type: "none" },
      });
      iconCircle(s, { x: x + 0.36, y: y + 0.36, d: 0.66, fill: C.white, icon: sp[0], color: C.teal });
      s.addText(sp[1], {
        x: x + 1.16, y: y + 0.26, w: g.w - 1.5, h: 0.34,
        fontFace: F.head, fontSize: 15.5, bold: true, color: C.ink, margin: 0, valign: "middle",
      });
      s.addText(sp[2], {
        x: x + 1.16, y: y + 0.62, w: g.w - 1.5, h: 0.6,
        fontFace: F.body, fontSize: 12.5, color: C.muted, lineSpacing: 16, margin: 0, valign: "top",
      });
    });
  });

  s.addText("Preencher concentração, tempos e instruções com os dados da ficha técnica oficial do produto.", {
    x: M, y: 6.26, w: CW, h: 0.3,
    fontFace: F.body, fontSize: 10.5, italic: true, color: C.muted, margin: 0, valign: "middle",
  });

  footer(s, 10);
  s.addNotes("Substituir os textos descritivos pelos valores reais da ficha técnica antes de enviar ao cliente.");
}

/* ────────────────────────── 11 · FECHAMENTO (DARK) ─────────────────────── */
{
  const s = newSlide();
  s.background = { color: C.deep };
  group(() => {
    s.addShape(pres.ShapeType.ellipse, {
      x: 9.2, y: 1.1, w: 5.4, h: 5.4,
      fill: { color: C.teal, transparency: 86 }, line: { type: "none" },
    });
    s.addShape(pres.ShapeType.ellipse, {
      x: 10.25, y: 2.15, w: 3.3, h: 3.3,
      fill: { color: C.mint, transparency: 86 }, line: { color: C.seafoam, width: 1.25 },
    });
    s.addImage({ data: ico("shield", C.mint), x: 11.16, y: 3.06, w: 1.48, h: 1.48 });
  });

  eyebrow(s, "Conclusão", { y: 1.5, color: C.mint });
  s.addText("Higienizar com segurança\ndeixou de ser uma escolha difícil.", {
    x: M, y: 1.92, w: 8.1, h: 2.1,
    fontFace: F.head, fontSize: 38, bold: true, color: C.white,
    charSpacing: -0.6, lineSpacing: 46, margin: 0, valign: "top",
  });
  s.addText(
    "Um aliado poderoso no cuidado diário: para a sua pele, para a sua casa e para o seu negócio.",
    {
      x: M, y: 4.18, w: 7.4, h: 0.8,
      fontFace: F.body, fontSize: 16, color: C.onDark, lineSpacing: 24, margin: 0, valign: "top",
    }
  );

  group(() => {
    s.addShape(pres.ShapeType.roundRect, {
      x: M, y: 5.12, w: 7.4, h: 1.06, rectRadius: 0.1,
      fill: { color: C.panel }, line: { type: "none" },
    });
    iconCircle(s, { x: M + 0.34, y: 5.34, d: 0.62, fill: C.mint, icon: "droplet", color: C.deep });
    s.addText("Solicite o guia completo e o catálogo técnico.", {
      x: M + 1.14, y: 5.12, w: 6.0, h: 1.06,
      fontFace: F.head, fontSize: 15.5, bold: true, color: C.white, margin: 0, valign: "middle",
    });
  });

  footer(s, 11, { dark: true });
  s.addNotes("Encerramento e chamada para ação. Inserir aqui os dados de contato da empresa antes da apresentação.");
}

} // fim de buildSlides()

/* ───────────────── PÓS-PROCESSAMENTO: TRANSIÇÕES E ANIMAÇÕES ────────────────
 * O pptxgenjs não escreve <p:transition> nem <p:timing>, então injetamos o XML
 * diretamente no pacote. Cada slide recebe:
 *   · uma transição de entrada (fade nos slides escuros, push nos claros);
 *   · animação de entrada "subir + surgir" nos elementos, em cascata.
 * Nada disso altera texto, posição ou cor de qualquer elemento.
 */

const STAGGER = 130; // ms entre ondas
const DUR = 520; // ms de duração de cada entrada
const RISE = 0.045; // deslocamento vertical inicial (fração da altura do slide)

// slides escuros entram com fade; os claros, com um leve push para cima
const TRANSICOES = {
  1: "<p:fade/>",
  4: "<p:fade/>",
  7: "<p:fade/>",
  11: "<p:fade/>",
};
const transicaoDe = (n) =>
  `<p:transition spd="med">${TRANSICOES[n] || '<p:push dir="u"/>'}</p:transition>`;

// Um efeito de entrada (visibilidade + subida + fade) para uma forma
function efeito(spid, nodeType, ids) {
  const alvo = `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;
  return (
    `<p:par><p:cTn id="${ids()}" presetID="42" presetClass="entr" presetSubtype="0"` +
    ` fill="hold" nodeType="${nodeType}">` +
    `<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:set><p:cBhvr><p:cTn id="${ids()}" dur="1" fill="hold">` +
    `<p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${alvo}` +
    `<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>` +
    `<p:to><p:strVal val="visible"/></p:to></p:set>` +
    `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base">` +
    `<p:cTn id="${ids()}" dur="${DUR}" fill="hold"/>${alvo}` +
    `<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr>` +
    `<p:tavLst>` +
    `<p:tav tm="0"><p:val><p:strVal val="#ppt_y+${RISE}"/></p:val></p:tav>` +
    `<p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>` +
    `</p:tavLst></p:anim>` +
    `<p:animEffect transition="in" filter="fade"><p:cBhvr>` +
    `<p:cTn id="${ids()}" dur="${DUR}"/>${alvo}</p:cBhvr></p:animEffect>` +
    `</p:childTnLst></p:cTn></p:par>`
  );
}

// Árvore de tempo do slide: uma onda por grupo de formas
function timingXml(ondas) {
  let seq = 3;
  const ids = () => ++seq;
  let primeiro = true;
  const grupos = ondas
    .map(({ delay, spids }) => {
      const efeitos = spids
        .map((spid) => {
          const tipo = primeiro ? "clickEffect" : "withEffect";
          primeiro = false;
          return efeito(spid, tipo, ids);
        })
        .join("");
      return (
        `<p:par><p:cTn id="${ids()}" fill="hold">` +
        `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>` +
        `<p:childTnLst>${efeitos}</p:childTnLst></p:cTn></p:par>`
      );
    })
    .join("");

  return (
    `<p:timing><p:tnLst><p:par>` +
    `<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek">` +
    `<p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>` +
    `<p:par><p:cTn id="3" fill="hold">` +
    `<p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
    `<p:childTnLst>${grupos}</p:childTnLst></p:cTn></p:par>` +
    `</p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>` +
    `</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`
  );
}

async function aplicarMovimento(arquivo) {
  const zip = await JSZip.loadAsync(fs.readFileSync(arquivo));

  for (let i = 0; i < SLIDES.length; i++) {
    const n = i + 1;
    const waves = SLIDES[i]._waves;

    // índice da forma (ordem de inserção) → spid atribuído pelo pptxgenjs
    const porOnda = new Map();
    waves.forEach((w, idx) => {
      if (!w) return; // onda 0 = elemento fixo
      if (!porOnda.has(w)) porOnda.set(w, []);
      porOnda.get(w).push(idx + 2);
    });

    const ondas = [...porOnda.keys()]
      .sort((a, b) => a - b)
      .map((w, k) => ({ delay: k * STAGGER, spids: porOnda.get(w) }));

    const caminho = `ppt/slides/slide${n}.xml`;
    let xml = await zip.file(caminho).async("string");
    xml = xml.replace(
      "</p:sld>",
      transicaoDe(n) + (ondas.length ? timingXml(ondas) : "") + "</p:sld>"
    );
    zip.file(caminho, xml);
  }

  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(arquivo, buf);
}

/* ───────────────────────────────── SAÍDA ───────────────────────────────── */

const OUT = path.join(__dirname, "Acido-Hipocloroso-Apresentacao.pptx");

(async () => {
  await buildIcons([C.teal, C.mint, C.deep, C.muted, C.white]);
  await prepararLogo();
  buildSlides();
  await pres.writeFile({ fileName: OUT });
  await aplicarMovimento(OUT);
  console.log("Gerado:", OUT);
  console.log(
    "Movimento:",
    SLIDES.map((s, i) => `s${i + 1}=${new Set(s._waves.filter(Boolean)).size} ondas`).join(" · ")
  );
})();
