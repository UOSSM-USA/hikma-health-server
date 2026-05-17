export type evalError = "NaNError" | "MaxDepthExceeded" | {
    TAG: "InvalidArguments";
    _0: string;
} | {
    TAG: "Thrown";
    _0: unknown;
};
