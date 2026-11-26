import type { SeedData } from "../seed";
import { fetchRepoTree, fetchTexts, loadPat, parseRepoUrl, type RepoRef } from "./github";
import { ModelUnavailable, callModel } from "./model";
import { rank } from "./rank";
import { LANG_BY_EXT, scan } from "./scan";
import {
  buildGroups, buildMapItems, buildTasksPayload, buildTourItems, cleanText,
  mergeMap, mergeReduce, mergeTasks, mergeTour,
} from "./structure";
import { extOf } from "./github";
import type { PipelineStepKey, StepState } from "./types";
import { PipelineError } from "./types";

export type GenerateOutcome = { data: SeedData; modelUsed: boolean; ref: RepoRef };

export type StepReporter = (step: StepState) => void;

function report(onStep: StepReporter, key: PipelineStepKey, status: StepState["status"], detail = "") {
  onStep({ key, status, detail });
}

/** 七步流水线：确定性骨架在浏览器本地完成，模型只通过同源后端补讲解文案。 */
export async function generateRepo(input: string, onStep: StepReporter): Promise<GenerateOutcome> {
  const startedAt = performance.now();
  const ref = parseRepoUrl(input);
  const pat = loadPat();

  report(onStep, "fetch", "running", "读取仓库文件树…");
  const tree = await fetchRepoTree(ref, pat);
  const sizeOf = new Map(tree.files.map((f) => [f.path, f.size]));
  const wanted = tree.files
    .filter((f) => {
      const name = f.path.split("/").pop() ?? "";
      return (
        LANG_BY_EXT[extOf(f.path)] !== undefined ||
        name.toLowerCase().startsWith("readme") ||
        f.path === "package.json" ||
        f.path === "pyproject.toml"
      );
    })
    .map((f) => f.path);
  const texts = await fetchTexts(ref, tree.branch, wanted, sizeOf, (done, total) => {
    report(onStep, "fetch", "running", `已取 ${done}/${total} 个文件`);
  });
  if (Object.keys(texts).length === 0) {
    throw new PipelineError("network", "文件内容全部拉取失败", "raw.githubusercontent.com 可能被网络拦截，稍后重试或换网络");
  }
  report(onStep, "fetch", "done", `${Object.keys(texts).length} 个文件 · 分支 ${tree.branch}`);

  report(onStep, "scan", "running", "解析 import 依赖与符号…");
  const scanData = scan(tree.files, texts, tree.hasCi);
  report(onStep, "scan", "done", `${scanData.stats.source_files} 个源码文件 · ${scanData.stats.edges} 条依赖边`);

  report(onStep, "rank", "running", "PageRank-lite 中心度排序…");
  const ranked = rank(scanData);
  report(onStep, "rank", "done", `选出 ${ranked.length} 个关键文件`);

  // 模型第 1 次调用：map + reduce（失败则全部走确定性兜底，不阻断生成）
  report(onStep, "map", "running", "生成模块卡片…");
  const mapItems = buildMapItems(scanData, ranked, texts);
  const groupsSkeleton = buildGroups(scanData, []);
  let modelMapReduce: Record<string, unknown> | null = null;
  try {
    modelMapReduce = await callModel("map-reduce", { items: mapItems, groups: groupsSkeleton });
  } catch (e) {
    if (!(e instanceof ModelUnavailable)) throw e;
  }
  const mapped = mergeMap(mapItems, modelMapReduce?.cards, texts);
  report(onStep, "map", "done", `${mapped.cards.length} 张模块卡片${modelMapReduce ? "" : "（静态兜底）"}`);

  report(onStep, "reduce", "running", "聚合分层架构图…");
  const skeleton = buildGroups(scanData, mapped.cards);
  const graph = mergeReduce(skeleton, modelMapReduce?.graph);
  report(onStep, "reduce", "done", `${graph.nodes.length} 个模块 · ${graph.edges.length} 条已验证边`);

  // 模型第 2 次调用：tour + tasks
  report(onStep, "tour", "running", "沿真实依赖链规划导览…");
  const tourItems = buildTourItems(scanData, ranked, mapped.cards, texts);
  const tasksPayload = buildTasksPayload(mapped.cards, scanData);
  let modelTourTasks: Record<string, unknown> | null = null;
  try {
    modelTourTasks = await callModel("tour-tasks", {
      chain: tourItems,
      tests: scanData.tests.slice(0, 5),
      readme: cleanText(scanData.readme, 600),
      modules: tasksPayload.modules,
      entry: tasksPayload.entry,
    });
  } catch (e) {
    if (!(e instanceof ModelUnavailable)) throw e;
  }
  const toured = mergeTour(modelTourTasks?.tour, tourItems, scanData, ranked, mapped.cards, texts);
  report(onStep, "tour", "done", `${toured.stops.length} 站导览${modelTourTasks ? "" : "（静态兜底）"}`);

  report(onStep, "tasks", "running", "生成分级上手任务…");
  const tasks = mergeTasks(modelTourTasks?.tasks, tasksPayload, texts);
  report(onStep, "tasks", "done", `${tasks.length} 个任务`);

  const modelUsed = modelMapReduce !== null && modelTourTasks !== null;
  const durationS = Math.round((performance.now() - startedAt) / 100) / 10;
  const data: SeedData = {
    meta: {
      repo_url: ref.url,
      commit: tree.branch,
      file_count: Object.keys(texts).length,
      note: modelUsed ? "在线生成 · 静态骨架 + 模型讲解" : "在线生成 · 纯静态分析（模型讲解暂不可用）",
    },
    result: {
      job_id: `online-${ref.owner}-${ref.repo}-${Date.now()}`,
      overview: {
        repo_url: ref.url,
        commit: tree.branch,
        stats: scanData.stats,
        entries: scanData.entries,
        tests: scanData.tests,
        readme_excerpt: cleanText(scanData.readme, 600),
      },
      graph,
      tour: toured.stops,
      modules: mapped.cards,
      tasks,
      stats: {
        evidence_total: mapped.evTotal + toured.evTotal,
        evidence_passed: mapped.evPassed + toured.evPassed,
        duration_s: durationS,
      },
    },
    files: texts,
  };
  return { data, modelUsed, ref };
}