import { SEEDS, type SeedKey } from "../lib/seed";

type RepoSwitchProps = {
  value: SeedKey;
  onPick: (slug: SeedKey) => void;
};

const KEYS = Object.keys(SEEDS) as SeedKey[];

export default function RepoSwitch({ value, onPick }: RepoSwitchProps) {
  return (
    <div className="rt-repos" role="group" aria-label="选择预烘焙仓库">
      {KEYS.map((key) => {
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            className={on ? "rt-repo rt-repo-on" : "rt-repo"}
            aria-pressed={on}
            onClick={() => onPick(key)}
            title={SEEDS[key].note}
          >
            <span className="rt-repo-dot" aria-hidden />
            <span className="font-mono">{SEEDS[key].repo}</span>
          </button>
        );
      })}
    </div>
  );
}