import * as Y from "yjs";
//
// declare module "yjs" { 
//     class YDoc extends Y.Doc {
//         getMap<T>(key?: string | undefined): YTMap<T>
//     } 
// }

// Y.Doc.prototype.getTMap = function <T>(key: string):YTMap<T> {
//     return  this.getMap(key) as unknown as YTMap<T>;
// }

export type YTMap<T , TVals extends T[keyof T] = T[keyof T], TMap extends Y.Map<TVals> = Y.Map<TVals>> = {
    [Property in keyof Omit<TMap, "get"| "set"| "toJSON">]: TMap[Property];
} & {
    toJSON(): T;
    get<TKey extends keyof T>(key: TKey): T[TKey];
    set<TKey extends keyof T, TValue extends T[TKey]>(key: TKey, value: TValue): TValue;
}


export function t<T>(map: Y.Map<unknown>): YTMap<T> {
    return map as unknown as YTMap<T>;
}


 