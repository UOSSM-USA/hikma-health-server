import { useMemo, useState } from "react";
import { LucideChevronDown, LucideSlidersHorizontal } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import type { FieldRuleSlots } from "@/models/form-rules";
import type { LogicField } from "@/lib/form-rule-templates";
import {
  ComputedValueSection,
  REQUIRED_IF_SECTION,
  RuleSection,
  ValidatorsSection,
  VISIBILITY_SECTION,
} from "./field-logic/sections";

// Re-exported surface: everything external code and tests import from
// this module. The implementation lives in ./field-logic/.
export {
  AdvancedRuleEditor,
  type AdvancedRuleEditorProps,
} from "./field-logic/AdvancedRuleInput";
export {
  REQUIRED_KIND_LABELS,
  type RuleState,
  syncTemplateFromAdvanced,
  syncTextFromSimple,
  type ValidationStatus,
  VALIDATOR_KIND_LABELS,
  VISIBILITY_KIND_LABELS,
} from "./field-logic/rule-model";

// ============================================================================
// FieldLogicPanel
//
// Mirrors the collapse-toggle shape of FieldTranslationPanel. Shows four
// sections: visibility, requiredIf, validators, and computedValue —
// each swapped for a disabled placeholder when the field type doesn't
// support it.
//
// Props:
//   - `form`     : immutable copy of every field in this form, in the
//                  abstracted LogicField shape. Used to populate the
//                  field-picker. Includes the current field.
//   - `fieldId`  : id of the field whose rule slots this panel edits.
//   - `initial`  : current rule slots on the field.
//   - `onSave`   : called when a section saves AND its rule(s) pass
//                  structural validation. Receives the full updated
//                  FieldRuleSlots object — the caller merges into the
//                  form state.
// ============================================================================

export type FieldLogicPanelProps = {
  form: ReadonlyArray<LogicField>;
  fieldId: string;
  initial: FieldRuleSlots;
  onSave: (slots: FieldRuleSlots) => void;
};

export function FieldLogicPanel({
  form,
  fieldId,
  initial,
  onSave,
}: FieldLogicPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Visibility and requiredIf rules can't reference the field being
  // edited (would be circular — its own visibility / required-ness
  // depending on its own value). Validators CAN reference the current
  // field — "this field must be > 0" is a common pattern.
  const visibilityFields = useMemo(
    () => form.filter((f) => f.id !== fieldId),
    [form, fieldId],
  );
  const validatorFields = useMemo(
    () => form.filter((f) => f.kind === "primitive"),
    [form],
  );

  const currentField = useMemo(
    () => form.find((f) => f.id === fieldId),
    [form, fieldId],
  );
  const isPrimitive = currentField?.kind === "primitive";

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="pt-2"
      data-testid="field-logic-panel"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-testid="field-logic-toggle"
          className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left text-sm font-semibold hover:bg-muted/40"
        >
          <span className="flex items-center gap-2">
            <LucideSlidersHorizontal size="1rem" />
            Logic & Validation
          </span>
          <LucideChevronDown
            size="1rem"
            className={`transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-3 ml-2 space-y-3 border-l-2 border-muted pl-4">
          <CollapsibleSection
            title="Visibility"
            defaultOpen={initial.visibleIf !== undefined}
            testId="visibility-section-toggle"
          >
            <RuleSection
              descriptor={VISIBILITY_SECTION}
              referenceableFields={visibilityFields}
              initialRule={initial.visibleIf}
              onSave={(rule) => onSave({ ...initial, visibleIf: rule })}
            />
          </CollapsibleSection>

          {isPrimitive ? (
            <CollapsibleSection
              title="Required when…"
              defaultOpen={initial.requiredIf !== undefined}
              testId="required-if-section-toggle"
            >
              <RuleSection
                descriptor={REQUIRED_IF_SECTION}
                referenceableFields={visibilityFields}
                initialRule={initial.requiredIf}
                onSave={(rule) => onSave({ ...initial, requiredIf: rule })}
              />
            </CollapsibleSection>
          ) : (
            <SectionPlaceholder
              title="Required when…"
              testId="required-if-section-placeholder"
            />
          )}

          {isPrimitive ? (
            <CollapsibleSection
              title="Validators"
              defaultOpen={(initial.validators ?? []).length > 0}
              testId="validators-section-toggle"
            >
              <ValidatorsSection
                currentFieldId={fieldId}
                referenceableFields={validatorFields}
                initialValidators={initial.validators ?? []}
                onSave={(validators) =>
                  onSave({
                    ...initial,
                    validators: validators.length > 0 ? validators : undefined,
                  })
                }
              />
            </CollapsibleSection>
          ) : (
            <SectionPlaceholder
              title="Validators"
              testId="validators-section-placeholder"
            />
          )}

          {isPrimitive ? (
            <CollapsibleSection
              title="Computed value"
              defaultOpen={initial.computedValue !== undefined}
              testId="computed-value-section-toggle"
            >
              <ComputedValueSection
                initialRule={initial.computedValue}
                onSave={(rule) => onSave({ ...initial, computedValue: rule })}
              />
            </CollapsibleSection>
          ) : (
            <SectionPlaceholder
              title="Computed value"
              testId="computed-value-section-placeholder"
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Visual match to CollapsibleSection's trigger row so the panel reads
// as a uniform stack of four section headers. No chevron and no click
// handler signals "this row is disabled".
function SectionPlaceholder({
  title,
  testId,
}: {
  title: string;
  testId?: string;
}) {
  return (
    <section className="opacity-60" data-testid={testId}>
      <div className="flex w-full items-center justify-between py-1 text-sm font-semibold">
        <span>{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Not supported for this field type.
      </p>
    </section>
  );
}

// Click-to-collapse wrapper around each of the four functional rule
// sections. Defaults: open if the slot already has content (so the
// author sees what's configured on load), closed otherwise (so a fresh
// field doesn't dump four empty editors). Local open state is
// uncontrolled per-mount — collapsing/expanding doesn't unmount the
// inner section, so its draft state survives toggles.
function CollapsibleSection({
  title,
  defaultOpen,
  testId,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  // testId is applied verbatim to the section header button so tests
  // can click to expand/collapse. Callers pass strings like
  // "visibility-section-toggle".
  testId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className="flex w-full items-center justify-between rounded-md py-1 text-left text-sm font-semibold hover:bg-muted/40"
        >
          <span>{title}</span>
          <LucideChevronDown
            size="1rem"
            className={
              "transition-transform " + (open ? "rotate-0" : "-rotate-90")
            }
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
