import type { evalError as JsonLogic_Eval_evalError } from './JsonLogic_Eval.gen.js';
import type { operatorMeta as JsonLogic_Catalog_operatorMeta } from './JsonLogic_Catalog.gen.js';
import type { parseError as JsonLogic_Parse_parseError } from './JsonLogic_Parse.gen.js';
import type { t as JsonLogic_Ast_t } from './JsonLogic_Ast.gen.js';
export type error = "MaxDepthExceeded" | "NaNError" | {
    TAG: "UnknownOperator";
    _0: string;
} | {
    TAG: "MultiKeyObject";
    _0: string[];
} | {
    TAG: "InvalidShape";
    readonly operator: string;
    readonly message: string;
} | {
    TAG: "InvalidArguments";
    _0: string;
} | {
    TAG: "Thrown";
    _0: unknown;
};
export type validationError = "MaxDepthExceeded" | {
    TAG: "InvalidJson";
    _0: string;
} | {
    TAG: "UnknownOperator";
    _0: string;
} | {
    TAG: "MultiKeyObject";
    _0: string[];
} | {
    TAG: "InvalidShape";
    readonly operator: string;
    readonly message: string;
};
export declare const parse: (_1: unknown) => {
    TAG: "Ok";
    _0: JsonLogic_Ast_t;
} | {
    TAG: "Error";
    _0: JsonLogic_Parse_parseError;
};
export declare const evaluate: (_1: JsonLogic_Ast_t, _2: unknown) => {
    TAG: "Ok";
    _0: unknown;
} | {
    TAG: "Error";
    _0: JsonLogic_Eval_evalError;
};
export declare const apply: (_1: unknown, _2: unknown) => {
    TAG: "Ok";
    _0: unknown;
} | {
    TAG: "Error";
    _0: error;
};
export declare const validate: (_1: unknown) => {
    TAG: "Ok";
    _0: void;
} | {
    TAG: "Error";
    _0: JsonLogic_Parse_parseError;
};
export declare const validateString: (_1: string) => {
    TAG: "Ok";
    _0: void;
} | {
    TAG: "Error";
    _0: validationError;
};
export declare const serialize: (_1: JsonLogic_Ast_t) => unknown;
export declare const operators: JsonLogic_Catalog_operatorMeta[];
export declare const isOk: <a, b>(_1: {
    TAG: "Ok";
    _0: a;
} | {
    TAG: "Error";
    _0: b;
}) => boolean;
export declare const isError: <a, b>(_1: {
    TAG: "Ok";
    _0: a;
} | {
    TAG: "Error";
    _0: b;
}) => boolean;
export declare const parseExn: (_1: unknown) => JsonLogic_Ast_t;
export declare const evaluateExn: (_1: JsonLogic_Ast_t, _2: unknown) => unknown;
export declare const applyExn: (_1: unknown, _2: unknown) => unknown;
export declare const getError: <a>(_1: a) => (undefined | error);
