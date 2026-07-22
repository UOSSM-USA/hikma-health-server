import { useMemo, useState } from "react";
import { LucideAlertCircle, LucideCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type {
  JsonLogicRule,
  RuleValidationError,
} from "@/models/form-rules";
import {
  advancedStatusToState,
  computeAdvancedStatus,
  type ValidationStatus,
} from "./rule-model";

// AdvancedRuleInput — pure JSON textarea + validation status. No Save;
// the owner supplies text state and receives every change. `allowEmpty`
// controls whether the empty state is treated as "OK, no rule"
// (visibility) or invalid (validators).

export type AdvancedRuleInputProps = {
  text: string;
  onTextChange: (text: string) => void;
  status: ValidationStatus;
  allowEmpty: boolean;
};

export function AdvancedRuleInput({
  text,
  onTextChange,
  status,
  allowEmpty,
}: AdvancedRuleInputProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">JSONLogic rule</Label>
      <Textarea
        aria-label="JSONLogic rule"
        value={text}
        onChange={(e) => onTextChange(e.currentTarget.value)}
        placeholder='e.g. { ">=": [{"var": "form.age"}, 18] }'
        className="min-h-[140px] font-mono text-xs"
        data-testid="rule-advanced-textarea"
      />
      <ValidationBadge status={status} allowEmpty={allowEmpty} />
    </div>
  );
}

function ValidationBadge({
  status,
  allowEmpty,
}: {
  status: ValidationStatus;
  allowEmpty: boolean;
}) {
  // `data-status` is the stable handle for tests — copy can drift, but
  // these four discriminants match the ValidationStatus variant exactly.
  // "empty" further splits into ok-when-allowed vs. required-error, so
  // assertions disambiguate via `data-allow-empty` on the empty branch.
  switch (status.kind) {
    case "empty":
      return allowEmpty ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="rule-validation-badge"
          data-status="empty"
          data-allow-empty="true"
        >
          Empty — saving will clear this rule.
        </p>
      ) : (
        <p
          className="flex items-center gap-1 text-xs text-destructive"
          data-testid="rule-validation-badge"
          data-status="empty"
          data-allow-empty="false"
        >
          <LucideAlertCircle size="0.875rem" /> Rule is required.
        </p>
      );
    case "ok":
      return (
        <p
          className="flex items-center gap-1 text-xs text-emerald-700"
          data-testid="rule-validation-badge"
          data-status="ok"
        >
          <LucideCheck size="0.875rem" /> Valid
        </p>
      );
    case "parseError":
      return (
        <p
          className="flex items-center gap-1 text-xs text-destructive"
          data-testid="rule-validation-badge"
          data-status="parse-error"
        >
          <LucideAlertCircle size="0.875rem" /> JSON: {status.message}
        </p>
      );
    case "logicError":
      return (
        <p
          className="flex items-center gap-1 text-xs text-destructive"
          data-testid="rule-validation-badge"
          data-status="logic-error"
        >
          <LucideAlertCircle size="0.875rem" />{" "}
          {formatRuleError(status.error)}
        </p>
      );
  }
}

function formatRuleError(e: RuleValidationError): string {
  // ReScript variants: payload-less ones are bare strings; the others
  // are tagged records carrying their payload directly. Must stay
  // exhaustive over RuleValidation.res's variant — a missed case renders
  // an error badge with no message.
  if (e === "MaxDepthExceeded") return "Rule is nested too deep.";
  if (e === "DynamicVarPath") {
    return "Field references must be static string ids like 'form.<id>'.";
  }
  switch (e.TAG) {
    case "UnknownOperator":
      return `Unknown operator: ${e._0}`;
    case "MultiKeyObject":
      return `Object has multiple operator keys: ${e._0.join(", ")}`;
    case "InvalidShape":
      return `Invalid ${e.operator}: ${e.message}`;
    case "ComplexityBudgetExceeded":
      return `Rule is too large: ${e.nodes} nodes exceeds the limit of ${e.limit}.`;
    case "IterationBudgetExceeded":
      return `Rule uses too many iteration operators: '${e.operator}' brings the count to ${e.count}; the limit is ${e.limit}.`;
  }
}

// Backwards-compatible standalone advanced editor: keeps the
// pre-refactor surface (input + Save button) so existing tests still
// work. New code should prefer `RuleEditor` (or `AdvancedRuleInput`
// directly).

export type AdvancedRuleEditorProps = {
  initialRule: JsonLogicRule | undefined;
  onSave: (rule: JsonLogicRule | undefined) => void;
};

export function AdvancedRuleEditor({
  initialRule,
  onSave,
}: AdvancedRuleEditorProps) {
  const [text, setText] = useState<string>(() =>
    initialRule === undefined ? "" : JSON.stringify(initialRule, null, 2),
  );
  const status = useMemo(() => computeAdvancedStatus(text), [text]);
  const state = useMemo(
    () => advancedStatusToState(status, /* allowEmpty */ true),
    [status],
  );
  return (
    <div className="space-y-2">
      <AdvancedRuleInput
        text={text}
        onTextChange={setText}
        status={status}
        allowEmpty={true}
      />
      <Button
        type="button"
        size="sm"
        disabled={!state.isValid}
        onClick={() => onSave(state.rule)}
        data-testid="rule-save"
      >
        Save visibility
      </Button>
    </div>
  );
}
