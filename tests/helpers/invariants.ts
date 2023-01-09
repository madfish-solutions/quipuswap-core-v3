import { deepEqual, equal, ok, rejects, strictEqual } from "assert";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";

import { QuipuswapV3 } from "@madfish/quipuswap-v3";

import {
  adjustScale,
  sqrtPriceForTick,
  tickAccumulatorsInside,
} from "@madfish/quipuswap-v3/dist/helpers/math";
import { Int, Nat, quipuswapV3Types } from "@madfish/quipuswap-v3/dist/types";
import {
  isInRange,
  entries,
  isMonotonic,
  safeObserve,
} from "@madfish/quipuswap-v3/dist/utils";
import { Map } from "immutable";

export async function checkAllInvariants(
  cfmm: QuipuswapV3,
  signers: Object,
  positionIds: Nat[],
  tickIndices: Int[],
  bufferMapIndices: Nat[],
): Promise<void> {
  const st = await cfmm.getStorage(positionIds, tickIndices, bufferMapIndices);
  await checkTickMapInvariants(cfmm, st);
  await checkTickInvariants(cfmm, st);
  await checkStorageInvariants(cfmm, st, tickIndices);
  await checkAccumulatorsInvariants(cfmm, st, tickIndices);
  await checkCumulativesBufferInvariants(cfmm, st);

  //await checkBalanceInvariants(cfmm, storage, positionIds, signers);
}

export async function checkAccumulatorsInvariants(
  cfmm: QuipuswapV3,
  storage: quipuswapV3Types.Storage,
  tickIndices: Int[],
): Promise<void> {
  const tickIndicesPaired = Array.from(new Set(tickIndices))
    .map((_, i) => [tickIndices[i], tickIndices[i + 1]])
    .slice(0, -1);

  const insideAccumulators = await Promise.all(
    tickIndicesPaired.map(async ([ti1, ti2]) => {
      return await tickAccumulatorsInside(cfmm, storage, ti1, ti2);
    }),
  );
  const sumInsideAccumulators = insideAccumulators.reduce((acc, cur) => {
    return {
      aSeconds: acc.aSeconds.plus(cur.aSeconds),
      aTickCumulative: acc.aTickCumulative.plus(cur.aTickCumulative),
      aFeeGrowth: acc.aFeeGrowth.plus(cur.aFeeGrowth),
      aSecondsPerLiquidity: acc.aSecondsPerLiquidity.plus(
        cur.aSecondsPerLiquidity,
      ),
    };
  });
  const currentTime = new BigNumber(Date.now() / 1000).integerValue(
    BigNumber.ROUND_CEIL,
  );

  const {
    tick_cumulative: cvTickCumulative,
    seconds_per_liquidity_cumulative: cvSecondsPerLiquidityCumulative,
  } = await safeObserve(cfmm, currentTime);

  const globalAccumulators = {
    aSeconds: currentTime,
    aTickCumulative: cvTickCumulative,
    aFeeGrowth: storage.feeGrowth.x.plus(storage.feeGrowth.y),
    aSecondsPerLiquidity: cvSecondsPerLiquidityCumulative,
  };
  equal(
    globalAccumulators.aSeconds.toFixed(),
    sumInsideAccumulators.aSeconds.toFixed(),
  );
  equal(
    globalAccumulators.aTickCumulative.toFixed(),
    sumInsideAccumulators.aTickCumulative.toFixed(),
  );
  equal(
    globalAccumulators.aFeeGrowth.toFixed(),
    sumInsideAccumulators.aFeeGrowth.toFixed(),
  );
  equal(
    globalAccumulators.aSecondsPerLiquidity.toFixed(),
    sumInsideAccumulators.aSecondsPerLiquidity.toFixed(),
  );
}

/**
 * Invariant:
 * The contract always has enough balance to liquidite all positions (and pay any fees due).
 */
async function checkBalanceInvariants(
  cfmm: QuipuswapV3,
  storage: quipuswapV3Types.Storage,
  positionIds: Nat[],
  signers: Object,
): Promise<void> {
  for (const positionId of positionIds) {
    const position = await storage.positions.get(positionId);
    const liquidityProvider = position.owner.toString();
    cfmm.tezos.setSignerProvider(signers[liquidityProvider]);
    await cfmm.updatePosition(
      positionId,
      position.liquidity.negated(),
      liquidityProvider.toString(),
      liquidityProvider.toString(),
      new Date("2025-01-01").toString(),
      new BigNumber(0),
      new BigNumber(0),
    );
  }
}

/**
 * Invariants:
 * 1. @cur_tick_witness@ is the highest initialized tick lower than or equal to @cur_tick_index@.
 * 2.1. Current liquidity is equal to the sum of all the tick's @liquidity_net@
 *      from the lowest tick up to the current tick.
 * 2.2. Current liquidity is also equal to the sum of liquidities of positions
 *      that cover the current tick.
 * 3. @sqrt_price@ is the correct price for @cur_tick_index@.
 */
export async function checkStorageInvariants(
  cfmm: QuipuswapV3,
  storage: quipuswapV3Types.Storage,
  tickIndices: Int[],
): Promise<void> {
  // Invariant 1.
  const ticks = storage.ticks.map;
  const curTickIndex = storage.curTickIndex;
  const expectedCurTickWitness = Int.max(
    ...tickIndices.filter(t => t.lte(curTickIndex)),
  );
  deepEqual(storage.curTickWitness, expectedCurTickWitness);
  // Invariant 2.1
  const liquiditiyAfterPriorTicks = tickIndices
    .filter(t => t.lte(curTickIndex))
    .map(t => ticks[t.toNumber()]!.liquidityNet)
    .reduce((acc, cur) => acc.plus(cur), new BigNumber(0));
  equal(storage.liquidity.toFixed(), liquiditiyAfterPriorTicks.toFixed());

  // Invariant 2.2.
  const liquidityOfActivePositions = Object.values(storage.positions.map)
    .map(position => {
      const { lowerTickIndex, upperTickIndex, liquidity } = position;
      if (curTickIndex.gte(lowerTickIndex) && curTickIndex.lt(upperTickIndex)) {
        return liquidity;
      }
      return new Nat(0);
    })
    .reduce((acc, cur) => {
      return acc.plus(cur);
    });
  equal(storage.liquidity.toFixed(), liquidityOfActivePositions.toFixed());

  // Invariant 3.
  // Note that the global @cur_tick_index@ does not always match the global @sqrt_price@ _exactly_.
  // A small swap may cause the @sqrt_price@ to move a tiny bit,
  // but it may not be enough to make the @cur_tick_index@ jump a whole unit (+1 or -1).
  //

  const [sqrtPriceForCurTick, sqrtPriceForNextTick] = [
    sqrtPriceForTick(curTickIndex),
    sqrtPriceForTick(curTickIndex.plus(1)),
  ];

  const inRange = (x: BigNumber) =>
    x.gte(adjustScale(sqrtPriceForCurTick, new Nat(80), new Nat(30))) &&
    x.lte(adjustScale(sqrtPriceForNextTick, new Nat(80), new Nat(30)));

  ok(inRange(adjustScale(storage.sqrtPrice, new Nat(80), new Nat(30))));
}

/**
 * Invariants:
 * 1. The sum of all the tick's liquidity_net must be 0
 * 2. Scanning the ticks from left-to-right, the running sum of their liquidity_net must never drop below 0
 *      (otherwise we'd have a tick range with negative liquidity)
 * 3. All ticks must have n_positions > 0
 */
export async function checkTickInvariants(
  cfmm: QuipuswapV3,
  storage: quipuswapV3Types.Storage,
): Promise<void> {
  let ticks = storage.ticks.map;

  const tickLiquidities = Object.entries(ticks)
    .sort((a, b) => (new BigNumber(a[0]).lt(new BigNumber(b[0])) ? -1 : 1))
    .map(v => v[1].liquidityNet);

  // Invariant 1
  equal(
    tickLiquidities
      .reduce((acc, cur) => acc.plus(cur), new BigNumber(0))
      .toFixed(),
    "0",
  );
  // Invariant 2
  tickLiquidities
    .reduce(
      (acc, cur) => {
        acc.push(acc[acc.length - 1].plus(cur));
        return acc;
      },
      [new BigNumber(0)],
    )
    .forEach(runningSum => {
      ok(runningSum.gte(0));
    });
  // Invariant 3
  Object.values(ticks).forEach(t => {
    ok(t.nPositions.gt(0));
  });
}

/**
 * -- | Invariants:
 * 1. The bigmap always contains at least 2 entries.
 * 2. The linked-list is acyclical.
 * 3. Tick indices are in strictly increasing order.
 * 4. All bigmap indices are reachable by traversing the linked-list front to back or back to front.
 * 5. All @prev@ and @next@ pointers are valid,
 *    except for the first tick's @prev@ pointer
 *    and the last tick tick's @next@ pointer.
 */

export async function checkTickMapInvariants(
  cfmm: QuipuswapV3,
  storage: quipuswapV3Types.Storage,
): Promise<void> {
  const ticks = storage.ticks.map;
  // Invariant 1
  ok(Object.keys(ticks).length >= 2);

  const checkIndices = (indices: number[]) => {
    // Invariant 2
    deepEqual(indices, [...new Set(indices)]);
    // Invariant 3
    deepEqual(indices, indices.sort());
    // Invariant 4
    deepEqual(indices, Object.keys(ticks).map(Number).sort());
  };

  // Invariant 5
  checkIndices(Object.keys(ticks).map(Number));
  checkIndices(Object.keys(ticks).map(Number).reverse());
}

/**
 * Invariants:
 * 1. Non-map fields in the buffer are sensible.
 *    1.1. The last index is greater or equal than the first index.
 *    1.2. The reserved map size is not smaller than the actual number of records.
 * 2. The map contains values under the appropriate keys.
 * 3. Timestamps increase strictly monotonically.
 * 4. Cumulative values increase strictly monotonically.
 *
 * We have no way to check that values outside of [first, last] range are dummy
 * values and only they are.
 */
export async function checkCumulativesBufferInvariants(
  cfmm: QuipuswapV3,
  storage: quipuswapV3Types.Storage,
): Promise<void> {
  const buffer = storage.cumulativesBuffer;
  // Invariant 1.1
  ok(buffer.last.gte(buffer.first));
  // Invariant 1.2
  ok(buffer.reservedLength.gte(buffer.last.minus(buffer.first).plus(1)));
  // Invariant 2
  const bufferMap = buffer.map.map;
  deepEqual(
    Object.keys(bufferMap),
    [...Array(buffer.reservedLength.toNumber()).keys()]
      .map(i => i + buffer.first.toNumber())
      .map(i => i.toString()),
  );

  // Invariant 3
  const bufferRecordsMap = entries(storage);
  const timestamps = Object.values(bufferRecordsMap).map(r => r.time);
  ok(isMonotonic(timestamps));
  // Invariant 4

  const sums = Object.values(bufferRecordsMap).map(r =>
    r.spl.sum.toBignumber(),
  );
  ok(isMonotonic(sums));
}

function merge<K, V>(
  f: (key: K, val1: V, val2: V) => V,
  map1: Map<K, V>,
  map2: Map<K, V>,
): Map<K, V> {
  const result = Map<K, V>();
  for (const [key, val1] of map1.entries()) {
    if (map2.has(key)) {
      result.set(key, f(key, val1, map2.get(key)!));
    } else {
      result.set(key, val1);
    }
  }
  for (const [key, val2] of map2.entries()) {
    if (!map1.has(key)) {
      result.set(key, val2);
    }
  }
  return result;
}

/**
 * -- | Invariants on storages separated in time.
 * -- | Invariants on storages separated in time.
--
-- 1. Recorded values to not change.
checkCumulativesBufferTimeInvariants
  :: forall caps base m. (HasCallStack, MonadNettest caps base m)
  => (Storage, Storage) -> m ()
checkCumulativesBufferTimeInvariants storages = do
  let mapBoth f (a, b) = (f a, f b)

  let buffers = mapBoth sCumulativesBuffer storages
  let bufferMaps = mapBoth cbEntries buffers

  -- Invariant 1
  let mergeEq k v1 v2 = assert (v1 == v2) $
        "Value for key " +| k |+ " has changed:\n\
        \  Was:\n    " +| v1 |+ "\n\
        \  After:\n    " +| v2 |+ "\n"
  _ <- uncurry
    (Map.Merge.mergeA
      Map.Merge.dropMissing
      Map.Merge.dropMissing
      (Map.Merge.zipWithAMatched mergeEq)
    ) bufferMaps

  pass

 */
export async function checkCumulativesBufferTimeInvariants(
  cfmm: QuipuswapV3,
  storages: [quipuswapV3Types.Storage, quipuswapV3Types.Storage],
): Promise<void> {
  const mapBoth =
    (f: (x: quipuswapV3Types.Storage) => any) =>
    ([a, b]: [quipuswapV3Types.Storage, quipuswapV3Types.Storage]): [
      any,
      any,
    ] =>
      [f(a), f(b)];

  const bufferMaps = mapBoth(cb => entries(cb))(storages);

  const mergeEq = (k: string, v1: any, v2: any) => {
    if (v1 !== v2) {
      throw new Error(
        `Value for key ${k} has changed:\n\
        \  Was:\n    ${JSON.stringify(v1)}\n\
        \  After:\n    ${JSON.stringify(v2)}\n`,
      );
    }
  };
  merge(mergeEq, Map(bufferMaps[0]), Map(bufferMaps[1]));
  /* Iterating over the first buffer map and comparing the values to the second buffer map. */
  // Object.entries(bufferMaps[0]).forEach(([k, v1]) => {
  //   const v2 = bufferMaps[1][k];
  //   mergeEq(k, v1, v2);
  // });
}
