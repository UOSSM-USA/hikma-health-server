export type t = {
    TAG: "Literal";
    _0: unknown;
} | {
    TAG: "ArrayOf";
    _0: t[];
} | {
    TAG: "Val";
    _0: t;
} | {
    TAG: "Var";
    _0: t;
} | {
    TAG: "Exists";
    _0: t;
} | {
    TAG: "Missing";
    _0: t;
} | {
    TAG: "Not";
    _0: t;
} | {
    TAG: "NotNot";
    _0: t;
} | {
    TAG: "And";
    _0: t[];
} | {
    TAG: "Or";
    _0: t[];
} | {
    TAG: "If";
    _0: t[];
} | {
    TAG: "Lt";
    _0: t[];
} | {
    TAG: "Lte";
    _0: t[];
} | {
    TAG: "Gt";
    _0: t[];
} | {
    TAG: "Gte";
    _0: t[];
} | {
    TAG: "Eq";
    _0: t[];
} | {
    TAG: "Neq";
    _0: t[];
} | {
    TAG: "StrictEq";
    _0: t[];
} | {
    TAG: "StrictNeq";
    _0: t[];
} | {
    TAG: "Add";
    _0: t;
} | {
    TAG: "Sub";
    _0: t;
} | {
    TAG: "Mul";
    _0: t;
} | {
    TAG: "Div";
    _0: t;
} | {
    TAG: "Mod";
    _0: t;
} | {
    TAG: "Min";
    _0: t;
} | {
    TAG: "Max";
    _0: t;
} | {
    TAG: "Map";
    _0: t;
    _1: t;
} | {
    TAG: "Filter";
    _0: t;
    _1: t;
} | {
    TAG: "Reduce";
    _0: t;
    _1: t;
    _2: t;
} | {
    TAG: "All";
    _0: t;
    _1: t;
} | {
    TAG: "Some_";
    _0: t;
    _1: t;
} | {
    TAG: "None_";
    _0: t;
    _1: t;
} | {
    TAG: "In";
    _0: t;
    _1: t;
} | {
    TAG: "MissingSome";
    _0: t;
    _1: t;
} | {
    TAG: "Merge";
    _0: t;
} | {
    TAG: "Throw";
    _0: t;
} | {
    TAG: "Try";
    _0: t[];
} | {
    TAG: "Coalesce";
    _0: t[];
} | {
    TAG: "Length";
    _0: t;
} | {
    TAG: "Cat";
    _0: t;
} | {
    TAG: "Substr";
    _0: t[];
} | {
    TAG: "Preserve";
    _0: unknown;
};
