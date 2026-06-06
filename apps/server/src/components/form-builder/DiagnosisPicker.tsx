import { Label } from "../ui/label";
import AsyncSelect from "react-select/async";
import type { MultiValue, SingleValue } from "react-select";
import MiniSearch from "minisearch";

/** Runtime shape of a diagnosis entry as it appears in the rule scope
 * (matches mobile's ICDEntry). */
export type ICDEntry = { code: string; desc: string };

type DiagnosisOption = {
  value: string;
  label: string;
  code: string;
  desc: string;
};

type Props = {
  name: string;
  description: string;
  withAsterisk: boolean;
  required?: boolean;
  multi?: boolean;
  /**
   * Controlled usage (e.g. the live preview pane): pass the selected
   * entries and receive updates in the runtime rule-scope shape.
   * Omit both to keep the original uncontrolled behavior.
   */
  value?: ReadonlyArray<ICDEntry>;
  onChange?: (entries: ICDEntry[]) => void;
};

let miniSearch: MiniSearch | null = null;

async function getMiniSearch() {
  if (!miniSearch) {
    const icd11 = (await import("@/data/icd11-xs.js")).default;
    miniSearch = new MiniSearch({
      fields: ["desc", "code"],
      storeFields: ["desc", "code"],
      idField: "code",
      searchOptions: {
        fuzzy: 1,
        boost: { desc: 5, code: 1 },
      },
    });
    miniSearch.addAll(icd11);
  }
  return miniSearch;
}

const toOption = (entry: ICDEntry): DiagnosisOption => ({
  value: `${entry.desc} (${entry.code})`,
  label: `${entry.desc} (${entry.code})`,
  code: entry.code,
  desc: entry.desc,
});

const toEntry = (option: DiagnosisOption): ICDEntry => ({
  code: option.code,
  desc: option.desc,
});

export function DiagnosisSelect({
  name,
  description,
  withAsterisk,
  required,
  multi,
  value,
  onChange,
}: Props) {
  const loadOptions = async (inputValue: string) => {
    const search = await getMiniSearch();
    return search
      .search(inputValue)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map((item) =>
        toOption({ code: item.code as string, desc: item.desc as string }),
      );
  };

  // Only controlled when the caller opts in; `undefined` keeps
  // react-select uncontrolled for the legacy usages.
  const controlledValue =
    value === undefined
      ? undefined
      : multi
        ? value.map(toOption)
        : value.length > 0
          ? toOption(value[0])
          : null;

  const handleChange = onChange
    ? (
        selected: MultiValue<DiagnosisOption> | SingleValue<DiagnosisOption>,
      ) => {
        if (Array.isArray(selected)) {
          onChange(selected.map(toEntry));
        } else if (selected) {
          onChange([toEntry(selected as DiagnosisOption)]);
        } else {
          onChange([]);
        }
      }
    : undefined;

  // FIXME: Need to replace the diagnosis picker with new select item from `react-select` with better creatable support
  return (
    <>
      <Label>
        {name}
        {withAsterisk && <span className="text-destructive">*</span>}
      </Label>
      {description && (
        <p id={`${name}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}

      <div className="mt-2">
        <AsyncSelect
          cacheOptions
          isMulti={multi}
          isClearable
          loadOptions={loadOptions}
          defaultOptions
          placeholder="Search for a diagnosis..."
          value={controlledValue}
          onChange={handleChange}
        />
      </div>
    </>
  );
}
