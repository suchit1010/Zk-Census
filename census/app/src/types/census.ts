import { Program, Idl } from '@coral-xyz/anchor';

export type Census = Program<any>;

export interface CensusIDL extends Idl {
  version: "0.1.0";
  name: "census";
  instructions: any[];
  accounts?: any[];
  events?: any[];
  errors?: any[];
}
