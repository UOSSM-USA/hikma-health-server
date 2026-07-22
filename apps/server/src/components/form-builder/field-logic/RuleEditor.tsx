import { useEffect, useMemo, useReducer } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { JsonLogicRule } from "@/models/form-rules";
import type { LogicField } from "@/lib/form-rule-templates";
import {
  computeAdvancedStatus,
  type EditorAction,
  type EditorConfig,
  type EditorMode,
  type EditorState,
  editorReduce,
  editorRuleState,
  initEditorState,
  type RuleState,
  type VisibilityKind,
} from "./rule-model";
import { AdvancedRuleInput } from "./AdvancedRuleInput";
import { SimpleRuleInput } from "./SimpleRuleInput";

// RuleEditor — shared between visibility/requiredIf sections and
// validators. Tabs across a simple template + a raw-JSON editor. Emits
// {rule, isValid} on change. No Save button; callers add their own.
//
// All editor state lives in one reducer over {mode, template, text}
// (see `editorReduce` in rule-model.ts): both tabs' drafts survive
// switching, and the switch action cross-syncs them atomically.

export type RuleEditorProps = {
  referenceableFields: ReadonlyArray<LogicField>;
  initialRule: JsonLogicRule | undefined;
  /**
   * Whether the simple-mode dropdown offers an "always" / no-rule kind.
   * Visibility allows it (no rule == "always visible"); validators don't
   * (every validator must carry a rule).
   */
  allowAlways: boolean;
  /**
   * Whether the section can combine several conditions (joined by AND).
   * Visibility / requiredIf do; validators don't — a validator carries a
   * single condition, and multiple validators are already AND-ed at the
   * section level.
   */
  allowMultiple: boolean;
  /**
   * Per-kind labels for the Simple "When" dropdown. Sections pass
   * context-appropriate verbs — visibility uses "Show when…", validators
   * use "Valid when…" — so the same template shape reads correctly in
   * each surface.
   */
  kindLabels: Record<VisibilityKind, string>;
  /**
   * Preferred default `fieldId` for a fresh comparison template
   * (`allowAlways=false`, no prior rule). When the validators section
   * passes the current field id here, "Add validator" opens with the
   * current field selected — which is the common case and silences the
   * self-reference warning by default.
   */
  defaultFieldId?: string;
  onChange: (state: RuleState) => void;
};

export function RuleEditor({
  referenceableFields,
  initialRule,
  allowAlways,
  allowMultiple,
  kindLabels,
  defaultFieldId,
  onChange,
}: RuleEditorProps) {
  const config: EditorConfig = useMemo(
    () => ({ allowAlways, allowMultiple, fields: referenceableFields }),
    [allowAlways, allowMultiple, referenceableFields],
  );

  const [state, dispatch] = useReducer(
    (s: EditorState, a: EditorAction) => editorReduce(config, s, a),
    null,
    () => initEditorState(config, initialRule, defaultFieldId),
  );

  const advancedStatus = useMemo(
    () => computeAdvancedStatus(state.text),
    [state.text],
  );
  const active = useMemo(() => editorRuleState(config, state), [config, state]);

  // Re-emit whenever the active mode's evaluation changes — including
  // when the user flips between tabs, so the parent's Save button
  // reflects the *visible* editor's state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `onChange` is unstable across renders (parent passes inline); depend on the evaluation only, otherwise we'd thrash.
  useEffect(() => {
    onChange(active);
  }, [active.rule, active.isValid]);

  return (
    <Tabs
      value={state.mode}
      onValueChange={(v) => dispatch({ kind: "switchMode", mode: v as EditorMode })}
    >
      <TabsList>
        <TabsTrigger value="simple" data-testid="rule-mode-simple">
          Simple
        </TabsTrigger>
        <TabsTrigger value="advanced" data-testid="rule-mode-advanced">
          Advanced (JSON)
        </TabsTrigger>
      </TabsList>

      <TabsContent value="simple" className="pt-3">
        <SimpleRuleInput
          referenceableFields={referenceableFields}
          template={state.template}
          onTemplateChange={(template) => dispatch({ kind: "editTemplate", template })}
          allowAlways={allowAlways}
          allowMultiple={allowMultiple}
          kindLabels={kindLabels}
        />
      </TabsContent>

      <TabsContent value="advanced" className="pt-3">
        <AdvancedRuleInput
          text={state.text}
          onTextChange={(text) => dispatch({ kind: "editText", text })}
          status={advancedStatus}
          allowEmpty={allowAlways}
        />
      </TabsContent>
    </Tabs>
  );
}
