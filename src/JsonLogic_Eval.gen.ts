/* TypeScript file generated from JsonLogic_Eval.res by genType. */

/* eslint-disable */
/* tslint:disable */

export type evalError = 
    "NaNError"
  | "MaxDepthExceeded"
  | { TAG: "InvalidArguments"; _0: string }
  | { TAG: "Thrown"; _0: unknown };
