import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateWorldviewPackage,
  buildWorldviewPackage,
  parseWorldviewBundleText,
  saveCustomWorldview,
  loadCustomWorldview,
  clearCustomWorldview,
  hasCustomWorldview,
  buildWorldviewPreview,
} from "./worldviewStorage.js";

// ── mock persistentBrowserStorage ──
const mockStorage = new Map();
vi.mock("../persistentBrowserStorage.js", () => ({
  getPersistentLocalItem: (key) => mockStorage.get(key) ?? null,
  setPersistentLocalItem: (key, value) => mockStorage.set(key, value),
  removePersistentLocalItem: (key) => mockStorage.delete(key),
}));

function makeMinimalWorldview(overrides = {}) {
  return {
    id: "test_world",
    title: "测试世界观",
    playerRole: { name: "测试君主", title: "皇帝" },
    storyPrompt: { systemPrefix: "你是一位..." },
    ...overrides,
  };
}

function makeMinimalOverrides(overrides = {}) {
  return {
    allowedCharacterIds: ["c1", "c2", "c3", "c4", "c5"],
    characters: {
      c1: { name: "角色一" },
      c2: { name: "角色二" },
      c3: { name: "角色三" },
      c4: { name: "角色四" },
      c5: { name: "角色五" },
    },
    factions: {
      f1: { name: "势力甲" },
      f2: { name: "势力乙" },
    },
    ...overrides,
  };
}

function makeValidPackage() {
  return buildWorldviewPackage(makeMinimalWorldview(), makeMinimalOverrides());
}

describe("worldviewStorage", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  // ── validateWorldviewPackage ──

  describe("validateWorldviewPackage", () => {
    it("应对完整包返回 valid", () => {
      const result = validateWorldviewPackage(makeValidPackage());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("应在 null 输入时报错", () => {
      const result = validateWorldviewPackage(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("应在缺少 worldview 字段时报错", () => {
      const result = validateWorldviewPackage({ overrides: makeMinimalOverrides() });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("worldview"))).toBe(true);
    });

    it("应在缺少 overrides 字段时报错", () => {
      const result = validateWorldviewPackage({ worldview: makeMinimalWorldview() });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("overrides"))).toBe(true);
    });

    it("应在 worldview.id 缺失时报错", () => {
      const pkg = makeValidPackage();
      delete pkg.worldview.id;
      const result = validateWorldviewPackage(pkg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("id"))).toBe(true);
    });

    it("应在角色不足时给出 warning", () => {
      const pkg = buildWorldviewPackage(makeMinimalWorldview(), {
        ...makeMinimalOverrides(),
        allowedCharacterIds: ["c1"],
        characters: { c1: { name: "独" } },
      });
      const result = validateWorldviewPackage(pkg);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("角色"))).toBe(true);
    });

    it("应在派系不足时给出 warning", () => {
      const pkg = buildWorldviewPackage(makeMinimalWorldview(), {
        ...makeMinimalOverrides(),
        factions: { f1: { name: "唯一" } },
      });
      const result = validateWorldviewPackage(pkg);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("派系"))).toBe(true);
    });

    it("应在 storyPrompt 缺失时给出 warning", () => {
      const pkg = buildWorldviewPackage(
        makeMinimalWorldview({ storyPrompt: undefined }),
        makeMinimalOverrides()
      );
      const result = validateWorldviewPackage(pkg);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("storyPrompt"))).toBe(true);
    });

    it("应在 nationInit.externalThreats 结构非法时报错", () => {
      const pkg = buildWorldviewPackage(
        makeMinimalWorldview(),
        makeMinimalOverrides({
          nationInit: {
            externalThreats: [{ power: "high" }],
          },
        })
      );
      const result = validateWorldviewPackage(pkg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("externalThreats"))).toBe(true);
    });

    it("应在 nationInit.provinces 结构非法时报错", () => {
      const pkg = buildWorldviewPackage(
        makeMinimalWorldview(),
        makeMinimalOverrides({
          nationInit: {
            provinces: [{ name: "临安", taxSilver: "很多" }],
          },
        })
      );
      const result = validateWorldviewPackage(pkg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("provinces"))).toBe(true);
    });

    it("应在 8 组文案字段类型错误时报错", () => {
      const pkg = buildWorldviewPackage(
        makeMinimalWorldview({
          startPageCopy: "bad",
          openingTurn: { briefingLines: "bad-array" },
          chronicleFormat: { displayPattern: 123 },
          courtViewCopy: { headerTitle: 10 },
          policyTreeCopy: { branchLabels: [] },
          rulerAbilityCopy: { abilityLabels: [] },
          worldEventCopy: { severityLabels: [] },
          publicOpinionCopy: { sectionTitle: 99 },
          uiSurfaceCopy: { policy: [], court: { kejuPanelTitle: 123 } },
        }),
        makeMinimalOverrides()
      );
      const result = validateWorldviewPackage(pkg);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("startPageCopy"))).toBe(true);
      expect(result.errors.some((e) => e.includes("openingTurn.briefingLines"))).toBe(true);
      expect(result.errors.some((e) => e.includes("chronicleFormat.displayPattern"))).toBe(true);
      expect(result.errors.some((e) => e.includes("policyTreeCopy.branchLabels"))).toBe(true);
      expect(result.errors.some((e) => e.includes("rulerAbilityCopy.abilityLabels"))).toBe(true);
      expect(result.errors.some((e) => e.includes("worldEventCopy.severityLabels"))).toBe(true);
      expect(result.errors.some((e) => e.includes("uiSurfaceCopy.policy"))).toBe(true);
      expect(result.errors.some((e) => e.includes("uiSurfaceCopy.court.kejuPanelTitle"))).toBe(true);
    });

    it("应在关键文案字段缺失时给出 warning", () => {
      const pkg = buildWorldviewPackage(
        makeMinimalWorldview({
          startPageCopy: {},
          openingTurn: {},
          chronicleFormat: {},
          courtViewCopy: {},
          policyTreeCopy: {},
          rulerAbilityCopy: {},
          worldEventCopy: {},
          publicOpinionCopy: {},
        }),
        makeMinimalOverrides()
      );
      const result = validateWorldviewPackage(pkg);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("startPageCopy.heroTitle"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("openingTurn.briefingLines"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("chronicleFormat.displayPattern"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("courtViewCopy.headerTitle"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("policyTreeCopy.treeTitle"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("rulerAbilityCopy.panelTitle"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("worldEventCopy.sectionTitle"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("publicOpinionCopy.sectionTitle"))).toBe(true);
    });
  });

  // ── buildWorldviewPackage ──

  describe("buildWorldviewPackage", () => {
    it("应构建含 meta 的包结构", () => {
      const pkg = buildWorldviewPackage(makeMinimalWorldview(), makeMinimalOverrides());
      expect(pkg.worldview.id).toBe("test_world");
      expect(pkg.overrides.factions).toBeDefined();
      expect(pkg.meta.id).toBe("test_world");
      expect(pkg.meta.title).toBe("测试世界观");
      expect(pkg.meta.importedAt).toBeTruthy();
    });

    it("应在无 id 时使用 fallback id", () => {
      const pkg = buildWorldviewPackage({ title: "无ID" }, {});
      expect(pkg.meta.id).toMatch(/^custom_/);
      expect(pkg.meta.title).toBe("无ID");
    });
  });

  describe("parseWorldviewBundleText", () => {
    it("应正确解析单文件导入包", () => {
      const worldview = makeMinimalWorldview();
      const overrides = makeMinimalOverrides();
      const bundle = [
        "这是示例导入包",
        "",
        "=== worldview.json ===",
        JSON.stringify(worldview, null, 2),
        "",
        "=== worldviewOverrides.json ===",
        JSON.stringify(overrides, null, 2),
        "",
      ].join("\n");

      const parsed = parseWorldviewBundleText(bundle);
      expect(parsed.worldview.id).toBe("test_world");
      expect(parsed.overrides.factions.f1.name).toBe("势力甲");
      expect(parsed.meta).toBeTruthy();
    });

    it("应在缺少分段时报错", () => {
      expect(() => parseWorldviewBundleText("{\"id\":\"x\"}"))
        .toThrow("导入包格式错误");
    });

    it("应在 worldview 分段 JSON 非法时报错", () => {
      const bundle = [
        "=== worldview.json ===",
        "{bad-json}",
        "=== worldviewOverrides.json ===",
        JSON.stringify(makeMinimalOverrides()),
      ].join("\n");

      expect(() => parseWorldviewBundleText(bundle))
        .toThrow("worldview.json 不是有效 JSON");
    });
  });

  // ── CRUD ──

  describe("save / load / clear / has", () => {
    it("初始状态下应无自定义世界观", () => {
      expect(hasCustomWorldview()).toBe(false);
      expect(loadCustomWorldview()).toBeNull();
    });

    it("保存后应能读取", () => {
      const pkg = makeValidPackage();
      saveCustomWorldview(pkg);
      expect(hasCustomWorldview()).toBe(true);
      const loaded = loadCustomWorldview();
      expect(loaded.worldview.id).toBe("test_world");
      expect(loaded.overrides.factions).toBeDefined();
    });

    it("清除后应恢复为空", () => {
      saveCustomWorldview(makeValidPackage());
      clearCustomWorldview();
      expect(hasCustomWorldview()).toBe(false);
      expect(loadCustomWorldview()).toBeNull();
    });

    it("损坏的 JSON 应返回 null", () => {
      mockStorage.set("czsim_custom_worldview_v1", "{{broken");
      expect(loadCustomWorldview()).toBeNull();
    });

    it("缺少 worldview/overrides 的 JSON 应返回 null", () => {
      mockStorage.set("czsim_custom_worldview_v1", JSON.stringify({ random: true }));
      expect(loadCustomWorldview()).toBeNull();
    });
  });

  // ── buildWorldviewPreview ──

  describe("buildWorldviewPreview", () => {
    it("应生成正确的预览信息", () => {
      const pkg = makeValidPackage();
      const preview = buildWorldviewPreview(pkg);
      expect(preview.id).toBe("test_world");
      expect(preview.title).toBe("测试世界观");
      expect(preview.playerRole).toContain("测试君主");
      expect(preview.characterCount).toBe(5);
      expect(preview.factionNames).toEqual(["势力甲", "势力乙"]);
      expect(preview.hasStoryPrompt).toBe(true);
    });

    it("应在 null 输入时返回 null", () => {
      expect(buildWorldviewPreview(null)).toBeNull();
    });

    it("应在无 playerRole 时返回空字符串", () => {
      const pkg = buildWorldviewPackage(makeMinimalWorldview({ playerRole: undefined }), makeMinimalOverrides());
      const preview = buildWorldviewPreview(pkg);
      expect(preview.playerRole).toBe("");
    });
  });
});
