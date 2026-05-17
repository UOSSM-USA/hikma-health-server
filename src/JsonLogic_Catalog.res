// Operator catalog — the single source of truth a UI editor binds to for
// rendering palettes, slot widgets, and labels.
//
// `argLabels` describes the first N slots. For variadic operators the
// list is the *named* slots (e.g. "left", "right" for `<`); the UI can
// render additional anonymous slots up to `maxArgs`. `maxArgs = None`
// means unbounded.
//
// `preserve` is the only operator with a non-rule slot — its argument is
// kept as raw JSON and not recursed into. Marked with category "Literal"
// so the UI can give it a JSON-value widget instead of a rule slot.

@genType
type operatorMeta = {
  key: string,
  aliases: array<string>,
  label: string,
  category: string,
  minArgs: int,
  maxArgs: option<int>,
  argLabels: array<string>,
}

let op = (
  ~key,
  ~aliases=[],
  ~label,
  ~category,
  ~minArgs,
  ~maxArgs=?,
  ~argLabels=[],
): operatorMeta => {
  key,
  aliases,
  label,
  category,
  minArgs,
  maxArgs,
  argLabels,
}

@genType
let operators: array<operatorMeta> = [
  // Path access
  op(~key="var", ~label="Variable", ~category="Path", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["path"]),
  op(~key="val", ~label="Value at path", ~category="Path", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["path"]),
  op(~key="exists", ~label="Exists", ~category="Path", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["path"]),
  op(~key="missing", ~label="Missing keys", ~category="Path", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["keys"]),
  op(~key="missing_some", ~label="Missing at least N", ~category="Path",
     ~minArgs=2, ~maxArgs=2, ~argLabels=["min", "keys"]),
  // Boolean negation
  op(~key="!", ~label="Not", ~category="Logical", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["value"]),
  op(~key="!!", ~label="To boolean", ~category="Logical", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["value"]),
  // Logical
  op(~key="and", ~label="And", ~category="Logical", ~minArgs=0),
  op(~key="or", ~label="Or", ~category="Logical", ~minArgs=0),
  // Conditional
  op(~key="if", ~aliases=["?:"], ~label="If/Else", ~category="Conditional",
     ~minArgs=2, ~argLabels=["condition", "then", "else"]),
  // Comparison
  op(~key="<", ~label="Less than", ~category="Comparison", ~minArgs=2,
     ~argLabels=["left", "right"]),
  op(~key="<=", ~label="Less or equal", ~category="Comparison", ~minArgs=2,
     ~argLabels=["left", "right"]),
  op(~key=">", ~label="Greater than", ~category="Comparison", ~minArgs=2,
     ~argLabels=["left", "right"]),
  op(~key=">=", ~label="Greater or equal", ~category="Comparison", ~minArgs=2,
     ~argLabels=["left", "right"]),
  op(~key="==", ~label="Loose equal", ~category="Comparison", ~minArgs=2,
     ~argLabels=["left", "right"]),
  op(~key="!=", ~label="Loose not equal", ~category="Comparison", ~minArgs=2,
     ~argLabels=["left", "right"]),
  op(~key="===", ~label="Strict equal", ~category="Comparison", ~minArgs=2,
     ~argLabels=["left", "right"]),
  op(~key="!==", ~label="Strict not equal", ~category="Comparison", ~minArgs=2,
     ~argLabels=["left", "right"]),
  // Arithmetic — single rule arg that evaluates to operand list or array literal.
  op(~key="+", ~label="Add", ~category="Arithmetic", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["values"]),
  op(~key="-", ~label="Subtract / negate", ~category="Arithmetic", ~minArgs=1,
     ~maxArgs=1, ~argLabels=["values"]),
  op(~key="*", ~label="Multiply", ~category="Arithmetic", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["values"]),
  op(~key="/", ~label="Divide", ~category="Arithmetic", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["values"]),
  op(~key="%", ~label="Modulo", ~category="Arithmetic", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["values"]),
  op(~key="min", ~label="Min", ~category="Arithmetic", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["values"]),
  op(~key="max", ~label="Max", ~category="Arithmetic", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["values"]),
  // Iteration
  op(~key="map", ~label="Map", ~category="Iteration", ~minArgs=2, ~maxArgs=2,
     ~argLabels=["collection", "callback"]),
  op(~key="filter", ~label="Filter", ~category="Iteration", ~minArgs=2, ~maxArgs=2,
     ~argLabels=["collection", "predicate"]),
  op(~key="reduce", ~label="Reduce", ~category="Iteration", ~minArgs=3, ~maxArgs=3,
     ~argLabels=["collection", "callback", "initial"]),
  op(~key="all", ~label="All", ~category="Iteration", ~minArgs=2, ~maxArgs=2,
     ~argLabels=["collection", "predicate"]),
  op(~key="some", ~label="Some", ~category="Iteration", ~minArgs=2, ~maxArgs=2,
     ~argLabels=["collection", "predicate"]),
  op(~key="none", ~label="None", ~category="Iteration", ~minArgs=2, ~maxArgs=2,
     ~argLabels=["collection", "predicate"]),
  // Collection / membership
  op(~key="in", ~label="In", ~category="Collection", ~minArgs=2, ~maxArgs=2,
     ~argLabels=["needle", "haystack"]),
  op(~key="merge", ~label="Merge", ~category="Collection", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["arrays"]),
  // Error handling
  op(~key="throw", ~label="Throw", ~category="Error", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["payload"]),
  op(~key="try", ~label="Try", ~category="Error", ~minArgs=1,
     ~argLabels=["attempt"]),
  // Coalesce
  op(~key="??", ~label="Coalesce", ~category="Coalesce", ~minArgs=1,
     ~argLabels=["value"]),
  // String / array
  op(~key="length", ~label="Length", ~category="String", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["value"]),
  op(~key="cat", ~label="Concatenate", ~category="String", ~minArgs=1, ~maxArgs=1,
     ~argLabels=["values"]),
  op(~key="substr", ~label="Substring", ~category="String", ~minArgs=2, ~maxArgs=3,
     ~argLabels=["string", "start", "length"]),
  // Escape hatch — argument is raw JSON, not a rule.
  op(~key="preserve", ~label="Preserve raw JSON", ~category="Literal",
     ~minArgs=1, ~maxArgs=1, ~argLabels=["value"]),
]
