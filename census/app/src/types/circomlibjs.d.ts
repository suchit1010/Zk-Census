declare module 'circomlibjs' {
  export interface PoseidonFunction {
    (inputs: (bigint | string | number)[]): Uint8Array;
    F: {
      toString(value: Uint8Array): string;
      toObject(value: Uint8Array): bigint;
      e(value: Uint8Array): bigint;
    };
  }

  export function buildPoseidon(): Promise<PoseidonFunction>;
  export function buildEddsa(): Promise<any>;
  export function buildBabyjub(): Promise<any>;
}
