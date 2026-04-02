const fs = require("fs");
const path = require("path");

const CHARACTERS_PATH = path.join(process.cwd(), "ChongzhenSim", "data", "characters.json");

const COURTESY_POOL = [
  "子和", "伯敬", "仲明", "叔达", "季常", "公望", "公实", "景行", "景纯", "元直",
  "元礼", "用晦", "用中", "子端", "子谨", "子敬", "子谦", "子安", "子正", "子廉",
  "君实", "君衡", "君佐", "君甫", "士林", "士弘", "士清", "士诚", "士修", "士贞",
  "文远", "文正", "文渊", "文衡", "文肃", "廷益", "廷和", "廷用", "廷佐", "廷弼",
  "伯安", "伯玉", "伯达", "伯恭", "伯修", "仲礼", "仲方", "仲肃", "仲谦", "叔正",
  "叔雅", "叔恭", "季和", "季文", "季衡", "懋功", "懋修", "懋德", "存中", "存诚",
  "敬之", "敬修", "慎言", "慎行", "明远", "明德", "明允", "允中", "允谦", "允和",
];

function hashCode(text) {
  let h = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) h = (h * 131 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pickFrom(list, seed) {
  return list[seed % list.length];
}

function buildSummary(c) {
  const born = Number.isFinite(c.birthYear) ? c.birthYear : "?";
  const died = Number.isFinite(c.deathYear) ? c.deathYear : "?";
  if (c.faction === "donglin") {
    return `${c.name}，${c.hometown}人，约生于${born}年、卒于${died}年。其人重名节，长于章奏议论，多从清议立场出言，常以整饬吏治、澄清言路为先。入朝后处事峻整，遇党争时立场鲜明，既能激励士气，也容易与权势掣肘。`;
  }
  if (c.faction === "military") {
    return `${c.name}，${c.hometown}人，约生于${born}年、卒于${died}年。其人久历军务，熟悉边防、饷道与将士调度，主张先稳军心再图战功。遇内忧外患时偏重执行与纪律，强调防线、粮械与兵额配套并进。`;
  }
  return `${c.name}，${c.hometown}人，约生于${born}年、卒于${died}年。其人以中枢政务见长，擅长在财政、铨叙与地方执行之间求取平衡。面对局势多变时倾向务实调和，先保运转再谋改革，重视制度连续与官僚秩序。`;
}

function buildAttitude(c) {
  if (c.faction === "donglin") {
    return "主张先清吏治与言路，再行财政治军；反对因权宜而牺牲名分纲纪。";
  }
  if (c.faction === "military") {
    return "主张军政并举、先固边防与饷道，再议进取；反对空耗兵力与临阵改令。";
  }
  return "主张以稳政为先、循序修补财政与官制；反对激进施政导致中枢失衡。";
}

function buildOpeningLine(c) {
  if (c.faction === "donglin") {
    return `陛下，臣以为朝纲之本在于名器与言路，若纪纲先立，则百政可次第而举。`;
  }
  if (c.faction === "military") {
    return `陛下，臣请先固军心与饷道，边防既稳，方可图战机而不致再耗国力。`;
  }
  return `陛下，臣愿先从可执行之处着手，稳住中枢与财计，再图后续整饬。`;
}

function main() {
  const raw = fs.readFileSync(CHARACTERS_PATH, "utf8");
  const data = JSON.parse(raw);
  const chars = Array.isArray(data.characters) ? data.characters : [];

  let touched = 0;
  chars.forEach((c) => {
    if (!c || typeof c !== "object") return;
    if (typeof c.summary !== "string" || !c.summary.includes("临时扩充的史实人物数据")) return;
    const seed = hashCode(c.id || c.name);
    c.courtesyName = pickFrom(COURTESY_POOL, seed);
    c.summary = buildSummary(c);
    c.attitude = buildAttitude(c);
    c.openingLine = buildOpeningLine(c);
    touched += 1;
  });

  data.characters = chars;
  fs.writeFileSync(CHARACTERS_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ touched, total: chars.length }, null, 2));
}

main();
