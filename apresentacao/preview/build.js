/* Monta o preview: injeta no template o logo tratado (claro e negativo) e os
 * ícones do deck como SVG inline. Mesmo tratamento do gerador do .pptx. */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const Fi = require("react-icons/fi");
const Md = require("react-icons/md");

const ICON_SET = {
  droplet: Fi.FiDroplet, shield: Fi.FiShield, eye: Fi.FiEye, heart: Fi.FiHeart,
  feather: Fi.FiFeather, check: Fi.FiCheckCircle, layers: Fi.FiLayers, clock: Fi.FiClock,
  refresh: Fi.FiRefreshCw, wind: Fi.FiWind, users: Fi.FiUsers, star: Fi.FiStar,
  home: Fi.FiHome, activity: Fi.FiActivity, zap: Fi.FiZap, award: Fi.FiAward,
  alert: Fi.FiAlertCircle, trending: Fi.FiTrendingUp, virus: Md.MdCoronavirus,
  bio: Md.MdBiotech, cpu: Fi.FiCpu, map: Fi.FiMapPin, repeat: Fi.FiRepeat,
  briefcase: Fi.FiBriefcase, coffee: Fi.FiCoffee, book: Fi.FiBookOpen,
};

const LOGO = "/home/user/Victor/apresentacao/logo-nebutech.png";

async function recortar(arq) {
  const { data, info } = await sharp(arq).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const lum = (x, y) => { const i = (y * W + x) * C; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  const barra = (x) => { let e = 0; for (let y = 0; y < H; y++) if (lum(x, y) < 120) e++; return e > H * 0.95; };
  let ini = 0, fim = W - 1;
  while (ini < W && barra(ini)) ini++;
  while (fim > ini && barra(fim)) fim--;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = ini; x <= fim; x++) if (lum(x, y) < 170) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

async function versoes() {
  const corte = await recortar(LOGO);
  const buf = await sharp(LOGO).flatten({ background: "#ffffff" }).extract(corte)
    .resize({ width: 720, kernel: "lanczos3" }).sharpen({ sigma: 0.9, m1: 0.5, m2: 2.5 }).png().toBuffer();
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const claro = Buffer.alloc(W * H * 4), escuro = Buffer.alloc(W * H * 4);
  const VERDE = [0x57, 0xbe, 0x5d];
  for (let p = 0; p < W * H; p++) {
    const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    const a = 1 - Math.min(r, g, b) / 255;
    if (a < 0.02) continue;
    const pura = (c) => Math.max(0, Math.min(255, Math.round((c - 255 * (1 - a)) / a)));
    const pr = pura(r), pg = pura(g), pb = pura(b), alfa = Math.round(a * 255);
    claro[i] = pr; claro[i + 1] = pg; claro[i + 2] = pb; claro[i + 3] = alfa;
    const cor = pg - Math.max(pr, pb) > 25 ? VERDE : [255, 255, 255];
    escuro[i] = cor[0]; escuro[i + 1] = cor[1]; escuro[i + 2] = cor[2]; escuro[i + 3] = alfa;
  }
  const o = { raw: { width: W, height: H, channels: 4 } };
  const [c, e] = await Promise.all([sharp(claro, o).png().toBuffer(), sharp(escuro, o).png().toBuffer()]);
  return {
    claro: "data:image/png;base64," + c.toString("base64"),
    escuro: "data:image/png;base64," + e.toString("base64"),
    ratio: H / W,
  };
}

(async () => {
  const logo = await versoes();
  let html = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");

  const css =
    "\n<style>\n" +
    ":root{--logo-ratio:" + logo.ratio.toFixed(4) + "}\n" +
    ".lg{background-image:url(" + logo.claro + ")}\n" +
    ".lg.dk{background-image:url(" + logo.escuro + ")}\n" +
    "</style>\n";
  html = html.replace("</style>", "</style>" + css);

  html = html.replace(/\{\{ICO:([a-z]+)\}\}/g, (_, nome) => {
    const Comp = ICON_SET[nome];
    if (!Comp) throw new Error("ícone desconhecido: " + nome);
    return renderToStaticMarkup(React.createElement(Comp, { size: 24 }))
      .replace(/\swidth="24"|\sheight="24"/g, "")
      .replace(/\sstyle="[^"]*"/g, "");
  });

  const pend = (html.match(/class="miss"/g) || []).length;
  fs.writeFileSync(path.join(__dirname, "preview.html"), html);
  console.log("preview.html gerado · logo ratio", logo.ratio.toFixed(3), "· marcações pendentes:", pend);
})();
