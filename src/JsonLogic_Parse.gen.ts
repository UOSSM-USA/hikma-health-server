/* TypeScript file generated from JsonLogic_Parse.res by genType. */

/* eslint-disable */
/* tslint:disable */

export type parseError = 
    "MaxDepthExceeded"
  | { TAG: "UnknownOperator"; _0: string }
  | { TAG: "MultiKeyObject"; _0: string[] }
  | { TAG: "InvalidShape"; readonly operator: string; readonly message: string };
