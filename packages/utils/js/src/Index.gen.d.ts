export declare const Logger_log: <T1>(_1: T1) => void;
export declare const Logger_warn: <T1>(_1: T1) => void;
export declare const Logger_error: <T1>(_1: T1) => void;
export declare const Logger_info: <T1>(_1: T1) => void;
export declare const Logger_Production_log: <T1>(_1: T1) => void;
export declare const Logger_Production_warn: <T1>(_1: T1) => void;
export declare const Logger_Production_error: <T1>(_1: T1) => void;
export declare const Logger_Production_info: <T1>(_1: T1) => void;
export declare const Logger: {
    Production: {
        log: <T1>(_1: T1) => void;
        error: <T1>(_1: T1) => void;
        info: <T1>(_1: T1) => void;
        warn: <T1>(_1: T1) => void;
    };
    log: <T1>(_1: T1) => void;
    error: <T1>(_1: T1) => void;
    info: <T1>(_1: T1) => void;
    warn: <T1>(_1: T1) => void;
};
