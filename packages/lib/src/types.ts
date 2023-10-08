// @ts-ignore
import { ZqField } from "ffjavascript";
import { EdwardsPoint } from "./babyJubjub";

export type BabyJubJub = {
  ec: any;
  Fb: ZqField;
  Fs: ZqField;
  cofactor: number;
};

export type Signature = {
  r: bigint;
  s: bigint;
};

// Contents of a proof for demonstrating a valid BabyJubjub ECDSA
// signature without revealing the signature's s value
// Based on the Efficient ECDSA formulation: https://personaelabs.org/posts/efficient-ecdsa-1/
export type EcdsaMembershipProof = {
  R: EdwardsPoint;
  msgHash: bigint;
  T: EdwardsPoint;
  U: EdwardsPoint;
  zkp: ZKP;
};

// Zero knowledge proof generated by snarkjs
export type ZKP = { proof: any; publicSignals: string[] };

// Inputs to the membership proof circuit
// Similar to inputs for Spartan-ecdsa membership circuit:
// https://github.com/personaelabs/spartan-ecdsa/blob/main/packages/circuits/eff_ecdsa_membership/pubkey_membership.circom
// Includes nullifierRandomness for generating unique nullifiers
export type MembershipZKPInputs = {
  s: bigint;
  root: bigint;
  Tx: bigint;
  Ty: bigint;
  Ux: bigint;
  Uy: bigint;
  pathIndices: number[];
  siblings: bigint[];
  nullifierRandomness: bigint;
};

export interface MerkleProof {
  root: bigint;
  pathIndices: number[];
  siblings: bigint[];
}
