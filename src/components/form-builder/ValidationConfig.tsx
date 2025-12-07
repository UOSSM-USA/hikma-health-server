import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import EventForm from "@/models/event-form";
import { useTranslation } from "@/lib/i18n/context";

type ValidationConfigProps = {
  field: EventForm.FieldData;
  onValidationChange: (validation: EventForm.ValidationRule[] | undefined) => void;
};

export function ValidationConfig({ field, onValidationChange }: ValidationConfigProps) {
  const t = useTranslation();
  const [validationRules, setValidationRules] = useState<EventForm.ValidationRule[]>(
    (field as any).validation || []
  );
  const [isExpanded, setIsExpanded] = useState(false);

  const updateRules = (rules: EventForm.ValidationRule[]) => {
    setValidationRules(rules);
    onValidationChange(rules.length > 0 ? rules : undefined);
  };

  const addRule = () => {
    const newRule: EventForm.ValidationRule = {
      type: "min",
      value: "",
    };
    updateRules([...validationRules, newRule]);
  };

  const removeRule = (index: number) => {
    updateRules(validationRules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updates: Partial<EventForm.ValidationRule>) => {
    const updated = [...validationRules];
    updated[index] = { ...updated[index], ...updates };
    updateRules(updated);
  };

  const validationTypes: { value: EventForm.ValidationRule["type"]; label: string }[] = [
    { value: "min", label: "Minimum Value" },
    { value: "max", label: "Maximum Value" },
    { value: "minLength", label: "Minimum Length" },
    { value: "maxLength", label: "Maximum Length" },
    { value: "pattern", label: "Pattern (Regex)" },
    { value: "email", label: "Email Format" },
  ];

  if (!isExpanded) {
    return (
      <div className="pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(true)}
        >
          {validationRules.length > 0
            ? `Configure Validation (${validationRules.length} rules)`
            : "Add Validation Rules"}
        </Button>
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Validation Rules</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(false)}
          >
            Collapse
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {validationRules.map((rule, index) => (
          <div key={index} className="flex gap-2 items-end p-3 border rounded-md">
            <div className="flex-1 space-y-2">
              <Label>Rule Type</Label>
              <select
                className="w-full px-3 py-2 border rounded-md text-sm"
                value={rule.type}
                onChange={(e) =>
                  updateRule(index, {
                    type: e.target.value as EventForm.ValidationRule["type"],
                    value: rule.type === e.target.value ? rule.value : "",
                  })
                }
              >
                {validationTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {(rule.type === "min" ||
              rule.type === "max" ||
              rule.type === "minLength" ||
              rule.type === "maxLength" ||
              rule.type === "pattern") && (
              <div className="flex-1 space-y-2">
                <Label>
                  {rule.type === "pattern" ? "Regex Pattern" : "Value"}
                </Label>
                <Input
                  type={rule.type === "pattern" ? "text" : "number"}
                  value={rule.value || ""}
                  onChange={(e) =>
                    updateRule(index, { value: e.target.value })
                  }
                  placeholder={
                    rule.type === "pattern" ? "/^[A-Z]+$/" : "Enter value"
                  }
                />
              </div>
            )}

            <div className="flex-1 space-y-2">
              <Label>Custom Message (Optional)</Label>
              <Input
                type="text"
                value={rule.message || ""}
                onChange={(e) => updateRule(index, { message: e.target.value })}
                placeholder="Leave empty for default message"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => removeRule(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={addRule} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Validation Rule
        </Button>
      </CardContent>
    </Card>
  );
}
