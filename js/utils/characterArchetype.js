function toCompactText(value) {
  return String(value || "").replace(/\s+/g, "");
}

const SCHOLAR_KEYWORDS = [
  "进士", "科举", "翰林", "学士", "文臣", "吏部", "礼部", "户部", "刑部", "工部", "左都御史", "右都御史", "都御史", "御史",
  "清流", "东林", "经世", "治国", "理财", "书院", "谏官",
];

const WARRIOR_KEYWORDS = [
  "总兵", "武将", "将领", "领兵", "军务", "边军", "边防", "兵部", "水师", "骑兵", "火器", "守边", "统兵",
  "督师", "提督", "参将", "游击", "戍边", "军功",
];

function hasKeyword(text, keywords) {
  const compact = toCompactText(text);
  return keywords.some((word) => compact.includes(word));
}

function normalizeArchetypes(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const set = new Set();
  list.forEach((item) => {
    const value = toCompactText(item).toLowerCase();
    if (!value) return;
    if (value === "scholar" || value === "文人" || value === "文臣") set.add("scholar");
    if (value === "warrior" || value === "武人" || value === "武将") set.add("warrior");
  });
  return set;
}

export function deriveCharacterArchetypes(character) {
  const explicit = normalizeArchetypes(character?.archetypes || character?.traits);
  if (explicit.size) return explicit;

  const mergedText = [
    ...(Array.isArray(character?.tags) ? character.tags : []),
    ...(Array.isArray(character?.positions) ? character.positions : []),
    character?.summary || "",
    character?.attitude || "",
  ].join(" ");

  const isScholar = hasKeyword(mergedText, SCHOLAR_KEYWORDS);
  const isWarrior = hasKeyword(mergedText, WARRIOR_KEYWORDS);

  const out = new Set();
  if (isScholar || !isWarrior) out.add("scholar");
  if (isWarrior) out.add("warrior");
  return out;
}

export function isScholarCharacter(character) {
  return deriveCharacterArchetypes(character).has("scholar");
}

export function isWarriorCharacter(character) {
  return deriveCharacterArchetypes(character).has("warrior");
}
