/* TypeScript file generated from JsonLogic.resi by genType. */

/* eslint-disable */
/* tslint:disable */

import * as JsonLogicJS from './JsonLogic.res.mjs';

import type {evalError as JsonLogic_Eval_evalError} from './JsonLogic_Eval.gen';

import type {operatorMeta as JsonLogic_Catalog_operatorMeta} from './JsonLogic_Catalog.gen';

import type {parseError as JsonLogic_Parse_parseError} from './JsonLogic_Parse.gen';

import type {t as JsonLogic_Ast_t} from './JsonLogic_Ast.gen';

export type error = 
    "MaxDepthExceeded"
  | "NaNError"
  | { TAG: "UnknownOperator"; _0: string }
  | { TAG: "MultiKeyObject"; _0: string[] }
  | { TAG: "InvalidShape"; readonly operator: string; readonly message: string }
  | { TAG: "InvalidArguments"; _0: string }
  | { TAG: "Thrown"; _0: unknown };

export type validationError = 
    "MaxDepthExceeded"
  | { TAG: "InvalidJson"; _0: string }
  | { TAG: "UnknownOperator"; _0: string }
  | { TAG: "MultiKeyObject"; _0: string[] }
  | { TAG: "InvalidShape"; readonly operator: string; readonly message: string };

export const parse: (_1:unknown) => 
    { TAG: "Ok"; _0: JsonLogic_Ast_t }
  | { TAG: "Error"; _0: JsonLogic_Parse_parseError } = JsonLogicJS.parse as any;

export const evaluate: (_1:JsonLogic_Ast_t, _2:unknown) => 
    { TAG: "Ok"; _0: unknown }
  | { TAG: "Error"; _0: JsonLogic_Eval_evalError } = JsonLogicJS.evaluate as any;

export const apply: (_1:unknown, _2:unknown) => 
    { TAG: "Ok"; _0: unknown }
  | { TAG: "Error"; _0: error } = JsonLogicJS.apply as any;

export const validate: (_1:unknown) => 
    { TAG: "Ok"; _0: void }
  | { TAG: "Error"; _0: JsonLogic_Parse_parseError } = JsonLogicJS.validate as any;

export const validateString: (_1:string) => 
    { TAG: "Ok"; _0: void }
  | { TAG: "Error"; _0: validationError } = JsonLogicJS.validateString as any;

export const serialize: (_1:JsonLogic_Ast_t) => unknown = JsonLogicJS.serialize as any;

export const operators: JsonLogic_Catalog_operatorMeta[] = JsonLogicJS.operators as any;

export const isOk: <a,b>(_1:
    { TAG: "Ok"; _0: a }
  | { TAG: "Error"; _0: b }) => boolean = JsonLogicJS.isOk as any;

export const isError: <a,b>(_1:
    { TAG: "Ok"; _0: a }
  | { TAG: "Error"; _0: b }) => boolean = JsonLogicJS.isError as any;

export const parseExn: (_1:unknown) => JsonLogic_Ast_t = JsonLogicJS.parseExn as any;

export const evaluateExn: (_1:JsonLogic_Ast_t, _2:unknown) => unknown = JsonLogicJS.evaluateExn as any;

export const applyExn: (_1:unknown, _2:unknown) => unknown = JsonLogicJS.applyExn as any;

export const getError: <a>(_1:a) => (undefined | error) = JsonLogicJS.getError as any;
