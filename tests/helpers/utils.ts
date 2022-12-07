import { QuipuswapV3 } from "@madfish/quipuswap-v3";
import { Nat, quipuswapV3Types } from "@madfish/quipuswap-v3/dist/types";
import {
  initTimedCumulatives,
  initTimedCumulativesBuffer,
} from "@madfish/quipuswap-v3/dist/utils";
import { TezosToolkit } from "@taquito/taquito";
import { BigNumber } from "bignumber.js";
import { expect } from "chai";
import { FA12 } from "./FA12";
import { FA2 } from "./FA2";

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
  //Gen.integral (Range.linearFrom 0 lowerBound upperBound)
  const lowerTickIndex =
    Math.ceil(Math.random() * 10000) * (Math.round(Math.random()) ? 1 : -1);
  // const lowerTickIndex = Math.floor(Math.random() * 10000);
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

export const compareStorages = (
  storage1: quipuswapV3Types.Storage,
  storage2: quipuswapV3Types.Storage,
) => {
  expect(storage1.newPositionId).to.be.deep.equal(storage2.newPositionId);
  expect(storage1.constants).to.be.deep.equal(storage2.constants);
  expect(storage1.sqrtPrice).to.be.deep.equal(storage2.sqrtPrice);
  expect(storage1.curTickIndex).to.be.deep.equal(storage2.curTickIndex);
  expect(storage1.curTickWitness).to.be.deep.equal(storage2.curTickWitness);
  expect(storage1.feeGrowth).to.be.deep.equal(storage2.feeGrowth);
  expect(storage1.ticks.map).to.be.deep.equal(storage2.ticks.map);

  expect(storage1.positions.map).to.be.deep.equal(storage2.positions.map);
  expect(storage1.liquidity).to.be.deep.equal(storage2.liquidity);

  // console.log("Edited");
  // console.log(storage1.cumulativesBuffer.map);
  // console.log(storage2.cumulativesBuffer.map);
  expect(storage1.cumulativesBuffer.map.map).to.be.deep.equal(
    storage2.cumulativesBuffer.map.map,
  );
  // console.log(
  //   storage1.cumulativesBuffer.first.toFixed(),
  //   storage2.cumulativesBuffer.first.toFixed(),
  // );
  // console.log(
  //   storage1.cumulativesBuffer.last.toFixed(),
  //   storage2.cumulativesBuffer.last.toFixed(),
  // );
  expect(storage1.cumulativesBuffer.first).to.be.deep.equal(
    storage2.cumulativesBuffer.first,
  );
  expect(storage1.cumulativesBuffer.last).to.be.deep.equal(
    storage2.cumulativesBuffer.last,
  );
  expect(storage1.cumulativesBuffer.reservedLength).to.be.deep.equal(
    storage2.cumulativesBuffer.reservedLength,
  );
};

export const getTypedBalance = async (
  tezos: TezosToolkit,
  tokenType: string,
  token: any,
  address: string,
) => {
  if (tokenType === "fa12") {
    const fa12 = new FA12(await tezos.contract.at(token["fa12"]), tezos);
    const balance = await fa12.getBalance(address);
    return new BigNumber(balance);
  } else {
    const fa2 = new FA2(
      await tezos.contract.at(token["fa2"].token_address),
      tezos,
    );
    const balance = await fa2.getBalance(address);
    return new BigNumber(balance);
  }
};

export const collectFees = async (
  pool: QuipuswapV3,
  recipient: string,
  posIds: BigNumber[],
) => {
  for (const posId of posIds) {
    try {
      await pool.updatePosition(
        posId,
        new BigNumber(0),
        recipient,
        recipient,
        new Date("2023-01-01T00:00:00Z").toString(),
        new BigNumber(0),
        new BigNumber(0),
      );
    } catch (e) {}
  }
};

export const cumulativesBuffer1 = async (now: string) => {
  const initVal = await initTimedCumulativesBuffer(new Nat(0));
  initVal.first = new Nat(1);
  initVal.last = new Nat(1);
  initVal.map.map = {};
  initVal.map.map[1] = initTimedCumulatives(now);
  return initVal;
};

// Create valid deadline with 1 hour plus from now
export const validDeadline = () => {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  return now.toString();
};
