const BN = require("bn.js");
// @ts-ignore
import { buildPoseidonReference } from "circomlibjs";
import { EdwardsPoint, WeierstrassPoint, babyjubjub } from "./babyJubjub";
import { Signature, MerkleProof } from "./types";
import { hashEdwardsPublicKey, hexToBigInt } from "./utils";

/**
 * Computes the merkle root based a list of public keys
 * Note that public keys must be in Twisted Edwards form
 * This is because we only ever use the Merkle Tree for in circuit verification,
 * and the circuit only ever uses Twisted Edwards points
 * @param pubKeys - The list of public keys to compute the merkle root of in Twisted Edwards form
 * @param hashFn - The hash function to use for the merkle tree. Defaults to Poseidon
 * @returns - The merkle root
 */
export const computeMerkleRoot = async (
  pubKeys: EdwardsPoint[],
  hashFn: any | undefined = undefined
): Promise<bigint> => {
  const proof = await generateMerkleProof(pubKeys, 0, hashFn);
  return proof.root;
};

/**
 * Generates a merkle proof for a given list of public keys and index
 * Once again, all public keys are represented in Twisted Edwards form
 * @param pubKeys - The list of public keys to generate the merkle proof for in Twisted Edwards form
 * @param index - The index of the public key to generate the merkle proof for
 * @param hashFn - The hash function to use for the merkle tree. Defaults to Poseidon
 * @returns - The merkle proof
 */
export const generateMerkleProof = async (
  pubKeys: EdwardsPoint[],
  index: number,
  hashFn: any | undefined = undefined
): Promise<MerkleProof> => {
  const TREE_DEPTH = 8; // We used a fixed depth merkle tree for now
  // Precomputed hashes of zero for each layer of the merkle tree
  const ZEROS = [
    "0",
    "14744269619966411208579211824598458697587494354926760081771325075741142829156",
    "7423237065226347324353380772367382631490014989348495481811164164159255474657",
    "11286972368698509976183087595462810875513684078608517520839298933882497716792",
    "3607627140608796879659380071776844901612302623152076817094415224584923813162",
    "19712377064642672829441595136074946683621277828620209496774504837737984048981",
    "20775607673010627194014556968476266066927294572720319469184847051418138353016",
    "3396914609616007258851405644437304192397291162432396347162513310381425243293",
  ];
  // Building poseidon actually takes a while, so it's best if it is passed in for client side proving
  const poseidon =
    hashFn === undefined ? await buildPoseidonReference() : hashFn;

  // All public keys are hashed before insertion into the tree
  const leaves = await Promise.all(pubKeys.map(hashEdwardsPublicKey));

  let prevLayer: bigint[] = leaves;
  let nextLayer: bigint[] = [];
  let pathIndices: number[] = [];
  let siblings: bigint[] = [];

  for (let i = 0; i < TREE_DEPTH; i++) {
    pathIndices.push(index % 2);
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    const sibling =
      siblingIndex === prevLayer.length
        ? BigInt(ZEROS[i])
        : prevLayer[siblingIndex];
    siblings.push(sibling);
    index = Math.floor(index / 2);

    for (let j = 0; j < prevLayer.length; j += 2) {
      const secondNode =
        j + 1 === prevLayer.length ? BigInt(ZEROS[i]) : prevLayer[j + 1];
      const nextNode = poseidon([prevLayer[j], secondNode]);
      nextLayer.push(hexToBigInt(poseidon.F.toString(nextNode, 16)));
    }

    prevLayer = nextLayer;
    nextLayer = [];
  }
  const root = prevLayer[0];

  return { root, pathIndices, siblings: siblings };
};

/**
 * Generates the public inputs for a membership proof
 * Uses notation and formulation from Efficient ECDSA
 * https://personaelabs.org/posts/efficient-ecdsa-1/
 * @param sig - The signature to generate the public inputs for
 * @param msgHash - The message hash to generate the public inputs for
 * @param pubKey - The public key to generate the public inputs for
 * @throws If the public inputs cannot be found, i.e. R cannot be recovered from the signature
 * @returns - The public inputs R, T, U based on Efficient ECDSA format
 */
export const getPublicInputsFromSignature = (
  sig: Signature,
  msgHash: bigint,
  pubKey: WeierstrassPoint
): { R: EdwardsPoint; T: EdwardsPoint; U: EdwardsPoint } => {
  const Fb = babyjubjub.Fb;
  const Fs = babyjubjub.Fs;

  // Because the cofactor is > 1, we must check multiple points
  // See public key recovery algorithm: https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm
  for (let i = 0; i < babyjubjub.cofactor; i++) {
    for (const parity of [0, 1]) {
      const r = Fb.add(sig.r, Fb.mul(BigInt(i), Fs.p));
      const rInv = Fs.inv(r);
      let ecR;
      try {
        // The following will throw an error if the point is not on the curve
        ecR = babyjubjub.ec.curve.pointFromX(
          new BN(r.toString(16), 16),
          parity
        );
      } catch (e) {
        continue;
      }
      const ecT = ecR.mul(rInv.toString(16));
      const T = WeierstrassPoint.fromEllipticPoint(ecT);
      const G = babyjubjub.ec.curve.g;
      const rInvm = Fs.neg(Fs.mul(rInv, msgHash));
      const ecU = G.mul(rInvm.toString(16));
      const U = WeierstrassPoint.fromEllipticPoint(ecU);
      const sT = ecT.mul(sig.s.toString(16));
      const ecsTU = sT.add(ecU);
      const sTU = WeierstrassPoint.fromEllipticPoint(ecsTU);

      if (sTU.equals(pubKey)) {
        const R = WeierstrassPoint.fromEllipticPoint(ecR);
        return { R: R.toEdwards(), T: T.toEdwards(), U: U.toEdwards() };
      }
    }
  }

  throw new Error("Could not find valid public inputs");
};
