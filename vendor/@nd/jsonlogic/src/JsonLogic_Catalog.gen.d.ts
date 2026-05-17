export type operatorMeta = {
    readonly key: string;
    readonly aliases: string[];
    readonly label: string;
    readonly category: string;
    readonly minArgs: number;
    readonly maxArgs: (undefined | number);
    readonly argLabels: string[];
};
export declare const operators: operatorMeta[];
