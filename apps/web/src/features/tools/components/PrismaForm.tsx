import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  type Count,
  type ExclusionReason,
  MAX_REASON_LABEL,
  MAX_REASONS,
  type MainCounts,
  newReason,
  type OtherCounts,
  type PrismaFlowState,
  type PrismaWarning,
  parseCount,
} from "../lib/prismaFlow";

type FieldDef<K> = { key: K; label: string };

const IDENTIFICATION_FIELDS: FieldDef<keyof MainCounts>[] = [
  { key: "databases", label: "Records from databases" },
  { key: "registers", label: "Records from registers" },
  { key: "duplicatesRemoved", label: "Duplicate records removed" },
  { key: "automationRemoved", label: "Marked ineligible by automation tools" },
  { key: "otherRemoved", label: "Removed for other reasons" },
];

const SCREENING_FIELDS: FieldDef<keyof MainCounts>[] = [
  { key: "recordsScreened", label: "Records screened" },
  { key: "recordsExcluded", label: "Records excluded" },
  { key: "reportsSought", label: "Reports sought for retrieval" },
  { key: "reportsNotRetrieved", label: "Reports not retrieved" },
  { key: "reportsAssessed", label: "Reports assessed for eligibility" },
];

const INCLUDED_FIELDS: FieldDef<keyof MainCounts>[] = [
  { key: "studiesIncluded", label: "Studies included in review" },
  { key: "reportsIncluded", label: "Reports of included studies" },
];

const OTHER_FIELDS: FieldDef<keyof OtherCounts>[] = [
  { key: "websites", label: "Records from websites" },
  { key: "organisations", label: "Records from organisations" },
  { key: "citationSearching", label: "Records from citation searching" },
  { key: "reportsSought", label: "Reports sought for retrieval" },
  { key: "reportsNotRetrieved", label: "Reports not retrieved" },
  { key: "reportsAssessed", label: "Reports assessed for eligibility" },
];

type CountFieldProps = {
  id: string;
  label: string;
  value: Count;
  onChange: (value: Count) => void;
  warning?: string;
};

function CountField({ id, label, value, onChange, warning }: CountFieldProps) {
  const warningId = `${id}-warning`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="n"
        value={value ?? ""}
        onChange={(event) => onChange(parseCount(event.target.value))}
        aria-describedby={warning ? warningId : undefined}
      />
      {warning ? (
        <p id={warningId} className="text-sm text-warning-muted-foreground">
          {warning}
        </p>
      ) : null}
    </div>
  );
}

type ReasonsEditorProps = {
  /** Prefixes accessible names so the two columns' rows stay distinct ("Other methods reason 1"). */
  namePrefix?: string;
  reasons: ExclusionReason[];
  onChange: (reasons: ExclusionReason[]) => void;
};

function ReasonsEditor({ namePrefix, reasons, onChange }: ReasonsEditorProps) {
  const name = (index: number) =>
    namePrefix ? `${namePrefix} reason ${index + 1}` : `Reason ${index + 1}`;
  const update = (id: string, patch: Partial<ExclusionReason>) =>
    onChange(reasons.map((reason) => (reason.id === id ? { ...reason, ...patch } : reason)));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Reports excluded, with reasons</p>
      {reasons.map((reason, index) => (
        <div key={reason.id} className="flex items-center gap-2">
          <Input
            aria-label={name(index)}
            placeholder={`Reason ${index + 1}`}
            maxLength={MAX_REASON_LABEL}
            value={reason.label}
            onChange={(event) => update(reason.id, { label: event.target.value })}
          />
          <Input
            aria-label={`${name(index)} count`}
            className="w-24 shrink-0"
            inputMode="numeric"
            autoComplete="off"
            placeholder="n"
            value={reason.count ?? ""}
            onChange={(event) => update(reason.id, { count: parseCount(event.target.value) })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${name(index).toLowerCase()}`}
            onClick={() => onChange(reasons.filter((r) => r.id !== reason.id))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={reasons.length >= MAX_REASONS}
        onClick={() => onChange([...reasons, newReason()])}
      >
        <Plus /> Add reason
      </Button>
    </div>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="font-display text-lg font-semibold text-foreground">{legend}</legend>
      {children}
    </fieldset>
  );
}

type PrismaFormProps = {
  state: PrismaFlowState;
  warnings: PrismaWarning[];
  onChange: (state: PrismaFlowState) => void;
};

export function PrismaForm({ state, warnings, onChange }: PrismaFormProps) {
  const warningFor = (field: string) => warnings.find((w) => w.field === field)?.message;
  const setMain = (key: keyof MainCounts, value: Count) =>
    onChange({ ...state, main: { ...state.main, [key]: value } });
  const setOther = (key: keyof OtherCounts, value: Count) =>
    onChange({ ...state, other: { ...state.other, [key]: value } });

  const mainFields = (fields: FieldDef<keyof MainCounts>[]) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(({ key, label }) => (
        <CountField
          key={key}
          id={`prisma-${key}`}
          label={label}
          value={state.main[key]}
          onChange={(value) => setMain(key, value)}
          warning={warningFor(key)}
        />
      ))}
    </div>
  );

  return (
    <form className="space-y-8" aria-label="PRISMA counts" onSubmit={(e) => e.preventDefault()}>
      <Group legend="Identification">{mainFields(IDENTIFICATION_FIELDS)}</Group>
      <Group legend="Screening">
        {mainFields(SCREENING_FIELDS)}
        <ReasonsEditor
          reasons={state.reasons}
          onChange={(reasons) => onChange({ ...state, reasons })}
        />
      </Group>

      <div className="flex items-center gap-3">
        <Switch
          id="prisma-other-methods"
          checked={state.otherMethods}
          onCheckedChange={(otherMethods) => onChange({ ...state, otherMethods })}
        />
        <Label htmlFor="prisma-other-methods">
          Include other methods (websites, citation searching)
        </Label>
      </div>
      {state.otherMethods ? (
        <Group legend="Other methods">
          <div className="grid gap-4 sm:grid-cols-2">
            {OTHER_FIELDS.map(({ key, label }) => (
              <CountField
                key={key}
                id={`prisma-other-${key}`}
                label={label}
                value={state.other[key]}
                onChange={(value) => setOther(key, value)}
                warning={key === "reportsAssessed" ? warningFor("otherReportsAssessed") : undefined}
              />
            ))}
          </div>
          <ReasonsEditor
            namePrefix="Other methods"
            reasons={state.otherReasons}
            onChange={(otherReasons) => onChange({ ...state, otherReasons })}
          />
        </Group>
      ) : null}

      <Group legend="Included">{mainFields(INCLUDED_FIELDS)}</Group>
    </form>
  );
}
