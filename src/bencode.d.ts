declare module 'bencode' {
    export function decode(data: Buffer | string, encoding?: string): any;
    export function encode(data: any): Buffer;
}
