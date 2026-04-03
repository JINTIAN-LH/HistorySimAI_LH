const fs = require("fs");
const path = require("path");

const TARGET_COUNT = 150;
const CHARACTERS_PATH = path.join(process.cwd(), "public", "data", "characters.json");

// Research seed pages used when curating the temporary expansion list:
// https://zh.wikipedia.org/wiki/明朝内阁辅臣列表
// https://zh.wikipedia.org/wiki/东林党
// https://zh.wikipedia.org/wiki/南明
const RESEARCHED_OFFICIALS = [
  ["gao_panlong", "高攀龙", 1562, 1626, "无锡", "donglin", "东林"],
  ["ye_xianggao", "叶向高", 1559, 1627, "福州", "neutral", "中立"],
  ["han_guang", "韩爌", 1560, 1644, "长治", "donglin", "东林"],
  ["liu_yijing", "刘一燝", 1567, 1635, "南昌", "donglin", "东林"],
  ["shi_fenglai", "施凤来", 1562, 1642, "平湖", "neutral", "中立"],
  ["qian_longxi", "钱龙锡", 1570, 1646, "常熟", "neutral", "中立"],
  ["cheng_jiming", "成基命", 1563, 1641, "宣城", "neutral", "中立"],
  ["li_guopu", "李国普", 1570, 1644, "安庆", "neutral", "中立"],
  ["huang_liji", "黄立极", 1568, 1638, "新城", "neutral", "中立"],
  ["qian_shisheng", "钱士升", 1574, 1652, "嘉善", "neutral", "中立"],
  ["liu_yuliang", "刘宇亮", 1579, 1650, "安福", "neutral", "中立"],
  ["xue_guoguan", "薛国观", 1595, 1641, "韩城", "neutral", "中立"],
  ["fan_fucui", "范复粹", 1570, 1644, "咸宁", "neutral", "中立"],
  ["wu_sheng", "吴甡", 1589, 1670, "蒲州", "neutral", "中立"],
  ["jiang_dejing", "蒋德璟", 1593, 1646, "晋江", "neutral", "中立"],
  ["huang_jingfang", "黄景昉", 1598, 1662, "晋江", "neutral", "中立"],
  ["fang_yuegong", "方岳贡", 1590, 1645, "歙县", "neutral", "中立"],
  ["chen_zizhuang", "陈子壮", 1596, 1647, "南海", "donglin", "东林"],
  ["ma_shiying", "马士英", 1591, 1646, "贵阳", "neutral", "中立"],
  ["ruan_dacheng", "阮大铖", 1587, 1646, "桐城", "neutral", "中立"],
  ["jiang_yueguang", "姜曰广", 1583, 1649, "莱阳", "donglin", "东林"],
  ["wang_duo", "王铎", 1592, 1652, "孟津", "neutral", "中立"],
  ["gao_hongtu", "高弘图", 1583, 1645, "会稽", "donglin", "东林"],
  ["zhang_shenyan", "张慎言", 1572, 1646, "阳城", "donglin", "东林"],
  ["lv_daqi", "吕大器", 1598, 1650, "遂宁", "neutral", "中立"],
  ["zeng_ying", "曾樱", 1582, 1646, "临川", "neutral", "中立"],
  ["xie_xuelong", "解学龙", 1553, 1628, "兴化", "neutral", "中立"],
  ["yang_lian", "杨涟", 1571, 1625, "应山", "donglin", "东林"],
  ["zuo_guangdou", "左光斗", 1575, 1625, "桐城", "donglin", "东林"],
  ["wei_dazhong", "魏大中", 1575, 1625, "嘉善", "donglin", "东林"],
  ["zhou_shunchang", "周顺昌", 1584, 1626, "吴县", "donglin", "东林"],
  ["miao_changqi", "缪昌期", 1562, 1626, "江阴", "donglin", "东林"],
  ["li_yingsheng", "李应升", 1593, 1627, "江阴", "donglin", "东林"],
  ["gu_dazhang", "顾大章", 1576, 1625, "常熟", "donglin", "东林"],
  ["zhao_nanxing", "赵南星", 1550, 1627, "高邑", "donglin", "东林"],
  ["zou_yuanbiao", "邹元标", 1551, 1624, "吉水", "donglin", "东林"],
  ["feng_congwu", "冯从吾", 1557, 1627, "长安", "donglin", "东林"],
  ["sun_shenxing", "孙慎行", 1565, 1635, "武进", "donglin", "东林"],
  ["bi_maokang", "毕懋康", 1569, 1644, "淄川", "neutral", "中立"],
  ["wei_zaode", "魏藻德", 1596, 1646, "曲周", "neutral", "中立"],
  ["chen_yan", "陈演", 1600, 1647, "长洲", "neutral", "中立"],
  ["he_kai", "何楷", 1590, 1645, "顺德", "donglin", "东林"],
  ["wen_zhenmeng", "文震孟", 1574, 1636, "长洲", "donglin", "东林"],
  ["liu_lishun", "刘理顺", 1578, 1644, "杞县", "neutral", "中立"],
  ["wei_xuelian", "魏学濂", 1598, 1644, "嘉善", "donglin", "东林"],
  ["wu_ganlai", "吴甘来", 1588, 1644, "宁化", "neutral", "中立"],
  ["wang_jiayan", "王家彦", 1583, 1644, "黄冈", "neutral", "中立"],
  ["li_jiantai", "李建泰", 1592, 1661, "曲沃", "neutral", "中立"],
  ["qi_biaojia", "祁彪佳", 1602, 1645, "山阴", "donglin", "东林"],
  ["lu_zhenfei", "路振飞", 1590, 1647, "阜宁", "neutral", "中立"],
  ["zhang_kentang", "张肯堂", 1591, 1645, "鄞县", "neutral", "中立"],
  ["xiong_tingbi", "熊廷弼", 1569, 1625, "江夏", "military", "军务"],
  ["man_gui", "满桂", 1594, 1630, "宣府", "military", "军务"],
  ["zu_kuan", "祖宽", 1600, 1642, "宁远", "military", "军务"],
  ["zhao_shuaijiao", "赵率教", 1567, 1629, "遵化", "military", "军务"],
  ["cao_bianjiao", "曹变蛟", 1600, 1641, "大同", "military", "军务"],
  ["qin_liangyu", "秦良玉", 1574, 1648, "忠州", "military", "军务"],
  ["zhu_dadian", "朱大典", 1583, 1646, "金华", "military", "军务"],
  ["wang_yingxiong", "王应熊", 1579, 1646, "巴县", "neutral", "中立"],
  ["zhang_zhifa", "张至发", 1566, 1638, "莱阳", "neutral", "中立"],
  ["fang_fengnian", "方逢年", 1593, 1647, "桐城", "neutral", "中立"],
  ["fang_kongzhao", "方孔炤", 1590, 1655, "桐城", "neutral", "中立"],
  ["chen_hongmi", "陈洪谧", 1603, 1652, "晋江", "neutral", "中立"],
  ["su_guansheng", "苏观生", 1592, 1647, "晋江", "neutral", "中立"],
  ["he_tengjiao", "何腾蛟", 1592, 1649, "黎平", "military", "军务"],
  ["qu_shisi", "瞿式耜", 1590, 1651, "常熟", "donglin", "东林"],
  ["jin_sheng", "金声", 1598, 1645, "休宁", "donglin", "东林"],
  ["xia_yunyi", "夏允彝", 1596, 1645, "华亭", "donglin", "东林"],
  ["chen_zilong", "陈子龙", 1608, 1647, "华亭", "donglin", "东林"],
  ["zhang_huangyan", "张煌言", 1620, 1664, "鄞县", "military", "军务"],
  ["shen_shixing", "申时行", 1535, 1614, "苏州", "neutral", "中立"],
  ["zhang_juzheng", "张居正", 1525, 1582, "江陵", "neutral", "中立"],
  ["gao_gong", "高拱", 1513, 1578, "新郑", "neutral", "中立"],
  ["xu_jie", "徐阶", 1503, 1583, "华亭", "neutral", "中立"],
  ["yan_song", "严嵩", 1480, 1567, "分宜", "neutral", "中立"],
  ["xia_yan", "夏言", 1482, 1548, "贵溪", "neutral", "中立"],
  ["zhang_cong", "张璁", 1475, 1539, "永嘉", "neutral", "中立"],
  ["yang_tinghe", "杨廷和", 1459, 1529, "新都", "neutral", "中立"],
  ["li_shi", "李时", 1471, 1539, "安福", "neutral", "中立"],
  ["fang_xianfu", "方献夫", 1482, 1544, "南海", "neutral", "中立"],
  ["mao_ji", "毛纪", 1463, 1545, "掖县", "neutral", "中立"],
  ["yang_yiqing", "杨一清", 1454, 1530, "绵竹", "neutral", "中立"],
  ["jiang_mian", "蒋冕", 1462, 1532, "全州", "neutral", "中立"],
  ["liang_chu", "梁储", 1453, 1527, "顺德", "neutral", "中立"],
  ["fei_hong", "费宏", 1468, 1535, "铅山", "neutral", "中立"],
  ["qiao_yu", "乔宇", 1459, 1527, "乐平", "neutral", "中立"],
  ["li_chunfang", "李春芳", 1511, 1584, "兴化", "neutral", "中立"],
  ["xu_guo", "许国", 1527, 1596, "歙县", "neutral", "中立"],
  ["wang_xijue", "王锡爵", 1534, 1611, "太仓", "neutral", "中立"],
  ["zhao_zhigao", "赵志皋", 1524, 1601, "兰溪", "neutral", "中立"],
  ["shen_yiguan", "沈一贯", 1531, 1615, "鄞县", "neutral", "中立"],
  ["zhu_geng", "朱赓", 1535, 1606, "山阴", "neutral", "中立"],
  ["yu_shenxing", "于慎行", 1545, 1607, "东阿", "neutral", "中立"],
  ["shen_li", "沈鲤", 1531, 1615, "归德", "neutral", "中立"],
  ["zhu_guozuo", "朱国祚", 1559, 1624, "秀水", "neutral", "中立"],
  ["fang_congzhe", "方从哲", 1559, 1628, "桐城", "neutral", "中立"],
];

function slugifyName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildTags(factionLabel) {
  if (factionLabel === "东林") return ["清议", "言官风骨", "讲求名节"];
  if (factionLabel === "军务") return ["边务", "用兵", "军政"];
  return ["朝臣", "理政", "待任"];
}

function buildSummary(name, hometown, factionLabel) {
  return `${name}，${hometown}人。为临时扩充的史实人物数据，定位为${factionLabel}出身官员，可参与朝廷任命与科举候选筛选。`;
}

function buildAttitude(factionLabel) {
  if (factionLabel === "东林") return "重视名节与言路清明，倾向整顿吏治、抑制朋党与阉宦干政。";
  if (factionLabel === "军务") return "更关注边防、军饷与战备执行，主张用兵与整饬营伍并重。";
  return "重视中枢运转、财政与官僚秩序，倾向在现实条件下稳住朝局。";
}

function buildOpeningLine(name, factionLabel) {
  if (factionLabel === "东林") return `臣${name}以为，朝廷当先正名分、清言路，而后百务可理。`;
  if (factionLabel === "军务") return `臣${name}以为，边备与军饷不可再缓，当先定兵心。`;
  return `臣${name}愿竭愚诚，先从整顿庶务入手，以求朝局渐稳。`;
}

function toCharacter(entry) {
  const [id, name, birthYear, deathYear, hometown, faction, factionLabel] = entry;
  if (birthYear < 1450 || birthYear > 1700 || deathYear < 1450 || deathYear > 1700) {
    throw new Error(`Out of range years for ${name}`);
  }
  return {
    id: slugifyName(id),
    name,
    courtesyName: null,
    birthYear,
    deathYear,
    hometown,
    positions: [],
    faction,
    factionLabel,
    loyalty: faction === "donglin" ? 42 : faction === "military" ? 48 : 35,
    isAlive: true,
    deathReason: null,
    deathDay: null,
    tags: buildTags(factionLabel),
    summary: buildSummary(name, hometown, factionLabel),
    attitude: buildAttitude(factionLabel),
    openingLine: buildOpeningLine(name, factionLabel),
  };
}

function main() {
  const raw = fs.readFileSync(CHARACTERS_PATH, "utf8");
  const data = JSON.parse(raw);
  const characters = Array.isArray(data.characters) ? data.characters : [];
  const existingIds = new Set(characters.map((item) => item.id));
  const existingNames = new Set(characters.map((item) => item.name));

  const additions = RESEARCHED_OFFICIALS
    .map(toCharacter)
    .filter((item) => !existingIds.has(item.id) && !existingNames.has(item.name));

  const needed = Math.max(0, TARGET_COUNT - characters.length);
  const selected = additions.slice(0, needed);
  data.characters = [...characters, ...selected];

  fs.writeFileSync(CHARACTERS_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    before: characters.length,
    added: selected.length,
    after: data.characters.length,
    remainingCandidates: Math.max(0, additions.length - selected.length),
  }, null, 2));
}

main();
