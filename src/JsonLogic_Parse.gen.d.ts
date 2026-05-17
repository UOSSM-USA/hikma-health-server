export type parseError = "MaxDepthExceeded" | {
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
