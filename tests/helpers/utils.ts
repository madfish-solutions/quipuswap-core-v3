import { QuipuswapV3 } from "@madfish/quipuswap-v3";
import { shiftLeft } from "@madfish/quipuswap-v3/dist/helpers/math";
import { CallMode, swapDirection } from "@madfish/quipuswap-v3/dist/types";
import { Nat, quipuswapV3Types } from "@madfish/quipuswap-v3/dist/types";
import {
  initTimedCumulatives,
  initTimedCumulativesBuffer,
  sendBatch,
} from "@madfish/quipuswap-v3/dist/utils";
import { TezosToolkit, TransferParams } from "@taquito/taquito";
import { BigNumber } from "bignumber.js";
import { expect } from "chai";
import { confirmOperation } from "../../scripts/confirmation";
import { FA12 } from "./FA12";
import { FA2 } from "./FA2";

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function advanceSecs(
  n: number,
  cfmms: QuipuswapV3[],
  returnParams = false,
) {
  for (let i = 0; i < n; i++) {
    await sleep(1000);
    let transferParams: TransferParams[] = [];
    for (const cfmm of cfmms) {
      cfmm.callSettings.increaseObservationCount = CallMode.returnParams;
      transferParams.push(
        await cfmm.increaseObservationCount(new BigNumber(0)),
      );
      cfmm.callSettings.increaseObservationCount =
        CallMode.returnConfirmatedOperation;
    }

    if (returnParams) {
      return transferParams;
    }
    const opBatch = await sendBatch(cfmms[0].tezos, transferParams);
    await confirmOperation(cfmms[0].tezos, opBatch.opHash);
    transferParams = [];
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
  skipBuffer: boolean = false,
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

  if (!skipBuffer) {
    expect(JSON.stringify(storage1.cumulativesBuffer.map.map)).to.be.equal(
      JSON.stringify(storage2.cumulativesBuffer.map.map),
    );
    expect(storage1.cumulativesBuffer.first).to.be.deep.equal(
      storage2.cumulativesBuffer.first,
    );
    expect(storage1.cumulativesBuffer.last).to.be.deep.equal(
      storage2.cumulativesBuffer.last,
    );
    expect(storage1.cumulativesBuffer.reservedLength).to.be.deep.equal(
      storage2.cumulativesBuffer.reservedLength,
    );
  }
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
    } catch (e) {
      return;
    }
  }
};

export const cumulativesBuffer1 = async (now: string) => {
  const initVal = await initTimedCumulativesBuffer(new Nat(0));
  initVal.first = new Nat(1);
  initVal.last = new Nat(1);
  initVal.map.map = {};
  initVal.map.map[1] = initTimedCumulatives(new BigNumber(now));
  return initVal;
};

// Create valid deadline with 1 hour plus from now
export const validDeadline = () => {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  return now.toString();
};

export const safeSwap = async (
  amountIn: BigNumber,
  amountOutMin: BigNumber,
  recipient: string,
  deadline: string,
  swapFunc: QuipuswapV3["swapXY"] | QuipuswapV3["swapYX"],
) => {
  try {
    await swapFunc(amountIn, deadline, amountOutMin, recipient);
  } catch (e) {
    if (e.message.includes("TezosOperationError: 101")) {
      await safeSwap(
        amountIn.div(3).integerValue(BigNumber.ROUND_FLOOR),
        amountOutMin,
        recipient,
        deadline,
        swapFunc,
      );
    }
  }
};

export const moreBatchSwaps = async (
  pool: QuipuswapV3,
  swapCount: number,
  amountIn: BigNumber,
  amountOutMin: BigNumber,
  recipient: string,
  swapDir: "XtoY" | "YtoX",
) => {
  const deadline = validDeadline();
  let transferParams: TransferParams[] = [];

  for (let i = 0; i < swapCount; i++) {
    if (swapDir === "XtoY") {
      transferParams.push(
        (await pool.swapXY(
          amountIn,
          deadline,
          amountOutMin,
          recipient,
        )) as TransferParams,
      );
    } else {
      transferParams.push(
        (await pool.swapYX(
          amountIn,
          deadline,
          amountOutMin,
          recipient,
        )) as TransferParams,
      );
    }
  }

  return transferParams;
};

export const groupAdjacent = <T>(l: T[]) => {
  return l.map((a1, i) => [a1, l[i + 1]]).slice(0, -1);
};

/**
 * 
 * -- timestamps.
gettingCumulativesInsideDiff
  :: (MonadNettest caps base m, HasCallStack)
  => ContractHandler Parameter Storage
  -> (TickIndex, TickIndex)
  -> m ()
  -> m CumulativesInsideSnapshot
gettingCumulativesInsideDiff cfmm (loTick, hiTick) action = do
  consumer <- originateSimple "consumer" [] contractConsumer

  call cfmm (Call @"Snapshot_cumulatives_inside") $
    SnapshotCumulativesInsideParam loTick hiTick (toContractRef consumer)
  action
  call cfmm (Call @"Snapshot_cumulatives_inside") $
    SnapshotCumulativesInsideParam loTick hiTick (toContractRef consumer)

  getStorage consumer >>= \case
    [s2, s1] -> return (subCumulativesInsideSnapshot s2 s1)
    _ -> failure "Expected exactly 2 elements"
 */

// export const getCumulativesInsideDiff = async(
//   pool: QuipuswapV3,
//   loTick: BigNumber,
//   hiTick: BigNumber,
//   action: () => Promise<void>,
// ) => {
//   const consumer = await originateConsumer(pool.tezos);
//   const s1 = await snapshotCumulativesInside(pool, loTick, hiTick, consumer);
//   await action();
//   const s2 = await snapshotCumulativesInside(pool, loTick, hiTick, consumer);
//   return subCumulativesInsideSnapshot(s2, s1);
// }

/**
 * // Recursive helper for `get_cumulatives`
let rec find_cumulatives_around (buffer, t, l, r : timed_cumulatives_buffer * timestamp * (nat * timed_cumulatives) * (nat * timed_cumulatives)) : (timed_cumulatives * timed_cumulatives * nat) =
    let (l_i, l_v) = l in
    let (r_i, r_v) = r in
    // Binary search, invariant: l_v.time <= t && t < r_v.time
    if l_i + 1n < r_i
    then
        let m_i = (l_i + r_i) / 2n in
        let m_v = get_registered_cumulatives_unsafe buffer m_i in
        let m = (m_i, m_v) in
        let (new_l, new_r) = if m_v.time > t then (l, m) else (m, r) in
        find_cumulatives_around (buffer, t, new_l, new_r)
    else
        (l_v, r_v, assert_nat (t - l_v.time, internal_observe_bin_search_failed))
 */

export const findCumulativesAround = (
  buffer: quipuswapV3Types.TimedCumulativesBuffer,
  timestamp: BigNumber,
  l: [BigNumber, quipuswapV3Types.TimedCumulative],
  r: [BigNumber, quipuswapV3Types.TimedCumulative],
) => {
  const [l_i, l_v] = l;
  const [r_i, r_v] = r;

  if (l_i.plus(1).lt(r_i)) {
    const m_i = l_i.plus(r_i).div(2);
    const m_v = buffer.map.get(new Nat(m_i));
    const m = [m_i, m_v] as [BigNumber, quipuswapV3Types.TimedCumulative];
    const new_l = m_v.time.gt(timestamp) ? l : m;
    const new_r = m_v.time.gt(timestamp) ? m : r;
    return findCumulativesAround(buffer, timestamp, new_l, new_r);
  }

  return {
    sumsAtLeft: l_v,
    sumsAtRight: r_v,
    timeDelta: r_v.time.minus(l_v.time),
  };
};

/**
 * // Calculate seconds_per_liquidity cumulative diff.
[@inline]
let eval_seconds_per_liquidity_x128(liquidity, duration : nat * nat) =
    if liquidity = 0n
    // It actually doesn't really matter how much we add to this accumulator
    // when there is no active liquidity. When calculating a liquidity miner's
    // rewards, we only care about the 'seconds per liquidity' accumulator's
    // value while the current tick was inside the position's range
    // (i.e., while the contract's liquidity was not zero).
    then 0n
    else Bitwise.shift_left duration 128n / liquidity
 */

export const evalSecondsPerLiquidityX128 = (
  liquidity: BigNumber,
  duration: BigNumber,
) => {
  if (liquidity.eq(0)) {
    return new BigNumber(0);
  }

  return shiftLeft(duration, new BigNumber(128)).div(liquidity);
};
