import { SEEDS, type SeedKey } from "../lib/seed";
import { listRecent } from "../lib/pipeline/store";

type RepoSwitchProps = {
  value: string;
  onPick: (slug: string) => void;
};

const SEED_KEYS = Object.keys(SEEDS) as SeedKey[];

export default function RepoSwitch({ value, onPick }: RepoSwitchProps) {
  const recent = listRecent();
  const entries: { slug: string; repo: string; note: string }[] = [
    ...SEED_KEYS.map((key) => ({ slug: key as string, repo: SEEDS[key].repo, note: SEEDS[key].note })),
    ...recent.map((e) => ({
      slug: e.slug,
      repo: e.repo,
      note: `在线生成 · ${e.modelUsed ? "模型讲解" : "静态分析"}`,
    })),
  ];
  return (
    <div className="rt-repos" role="group" aria-label="选择仓库">
      {entries.map((item) => {
        const on = item.slug === value;
        return (
          <button
            key={item.slug}
            type="button"
            className={on ? "rt-repo rt-repo-on" : "rt-repo"}
            aria-pressed={on}
            onClick={() => onPick(item.slug)}
            title={item.note}
          >
            <span className="rt-repo-dot" aria-hidden />
            <span className="font-mono">{item.repo}</span>
          </button>
        );
      })}
    </div>
  );
}