import { QuipuswapV3 } from "@madfish/quipuswap-v3";
import { Nat } from "@madfish/quipuswap-v3/dist/types";
import { BigNumber } from "bignumber.js";

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function advanceSecs(n: number, cfmms: QuipuswapV3[]) {
  for (let i = 0; i < n; i++) {
    await sleep(1000);
    for (const cfmm of cfmms) {
      await cfmm.inreaseObservationCount(new BigNumber(0));
    }
  }
}

/**
 */
export const genCreatePositionData = async () => {
  const liquidityDelta = Math.floor(Math.random() * 100000);
  const lowerTickIndex = Math.floor(Math.random() * 10000);
  const upperTickIndex = Math.floor(
    Math.random() * (10000 - lowerTickIndex) + lowerTickIndex + 1,
  );
  const cpdWaitTime = Math.floor(Math.random() * 10);
  return {
    liquidityDelta,
    lowerTickIndex,
    upperTickIndex,
    cpdWaitTime,
  };
};
/**
 * -- | Generate a series of positions whose boundaries are guaranteed to not overlap.
 */
export const genNonOverlappingPositions = async () => {
  const cpds: any[] = [];
  for (let i = 0; i < 8; i++) {
    cpds.push(await genCreatePositionData());
  }
  const boundsOverlap = (thisCpd, otherCpds) => {
    const allTickIndices = [thisCpd, ...otherCpds].flatMap(cpd => [
      cpd.lowerTickIndex,
      cpd.upperTickIndex,
    ]);
    return allTickIndices.length !== new Set(allTickIndices).size;
  };
  return cpds.reduce((nonOverlapping, cpd) => {
    if (boundsOverlap(cpd, nonOverlapping)) {
      return nonOverlapping;
    } else {
      return [cpd, ...nonOverlapping];
    }
  }, []);
};

export const genSwapDirection = () => {
  return Math.floor(Math.random() * 2);
};
export const genFees = (feeCount: number, zeroFee: boolean = false) => {
  const fees: number[] = [];
  for (let i = 0; i < feeCount; i++) {
    fees.push(zeroFee ? 0 : Math.floor(Math.random() * 1e4));
  }
  return fees;
};

export const genNatIds = maxId => {
  const ids: Nat[] = [];
  for (let i = 0; i < maxId; i++) {
    ids.push(new Nat(i));
  }
  return ids;
};

export const inRange = (x: BigNumber, y: BigNumber, z: BigNumber) => {
  return x.gte(y) && x.lte(z);
};
