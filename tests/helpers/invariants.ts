import { deepEqual, equal, rejects, strictEqual } from "assert";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";

import { QuipuswapV3 } from "@madfish/quipuswap-v3";

import { tickAccumulatorsInside } from "@madfish/quipuswap-v3/dist/helpers/math";
import { Int, Nat, quipuswapV3Types } from "@madfish/quipuswap-v3/dist/types";

export async function checkAllInvariants(
  cfmm: QuipuswapV3,
  storage: quipuswapV3Types.Storage,
  positionIds: Nat[],
  tickIndices: Int[],
  signers: Object,
): Promise<void> {
  await checkBalanceInvariants(cfmm, storage, positionIds, signers);
  //await checkAccumulatorsInvariants(cfmm, storage, tickIndices);
}

export async function checkAccumulatorsInvariants(
  cfmm: QuipuswapV3,
  storage: quipuswapV3Types.Storage,
  tickIndices: Int[],
): Promise<void> {
  const tickIndicesPaired = tickIndices
    .map((_, i) => [tickIndices[i], tickIndices[i + 1]])
    .slice(0, -1);
  console.log("tickIndicesPaired", tickIndicesPaired);

  const insideAccumulators = await Promise.all(
    tickIndicesPaired.map(async ([ti1, ti2]) => {
      console.log("ti1", ti1, "ti2", ti2);
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
  const currentTIme = new BigNumber(Math.floor(Date.now() / 1000)).plus(1);
  const {
    tick_cumulative: cvTickCumulative,
    seconds_per_liquidity_cumulative: cvSecondsPerLiquidityCumulative,
  } = (await cfmm.observe([currentTIme.toString()]))[0];

  const globalAccumulators = {
    aSeconds: currentTIme,
    aTickCumulative: cvTickCumulative,
    aFeeGrowth: storage.feeGrowth.x.plus(storage.feeGrowth.y),
    aSecondsPerLiquidity: cvSecondsPerLiquidityCumulative,
  };

  // equal(
  //   globalAccumulators.aSeconds.toFixed(),
  //   sumInsideAccumulators.aSeconds.toFixed(),
  // );
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
 -- | Invariants:
-- 1. @cur_tick_witness@ is the highest initialized tick lower than or equal to @cur_tick_index@.
-- 2.1. Current liquidity is equal to the sum of all the tick's @liquidity_net@
--      from the lowest tick up to the current tick.
-- 2.2. Current liquidity is also equal to the sum of liquidities of positions
--      that cover the current tick.
-- 3. @sqrt_price@ is the correct price for @cur_tick_index@.
checkStorageInvariants :: (HasCallStack, MonadNettest caps base m) => Storage -> m ()
checkStorageInvariants st = do
  -- Invariant 1.
  ticks <- mapToList (sTicks st)
  let curTickIndex = sCurTickIndex st
  let expectedCurTickWitness = ticks <&> fst & filter (<= curTickIndex) & maximum
  sCurTickWitness st @== expectedCurTickWitness

  -- Invariant 2.1.
  let liquiditiyAfterPriorTicks =
        ticks
        & filter (\t -> fst t <= curTickIndex)
        <&> (\t -> snd t & tsLiquidityNet)
        & sum
  sLiquidity st @== fromIntegral @Integer @Natural liquiditiyAfterPriorTicks

  -- Invariant 2.2.
  let liquidityOfActivePositions = sum do
        PositionState{..} <- elems (bmMap $ sPositions st)
        guard (curTickIndex `inTicksRange` (psLowerTickIndex, psUpperTickIndex))
        return psLiquidity
  sLiquidity st @== liquidityOfActivePositions

  -- Invariant 3.
  -- Note that the global @cur_tick_index@ does not always match the global @sqrt_price@ _exactly_.
  -- A small swap may cause the @sqrt_price@ to move a tiny bit,
  -- but it may not be enough to make the @cur_tick_index@ jump a whole unit (+1 or -1).
  checkCompares
    (sCurTickIndex st & sqrtPriceFor, sCurTickIndex st + 1 & sqrtPriceFor)
    inRange
    (sSqrtPrice st & adjustScale)

 */
// export async function checkStorageInvariants(
//   cfmm: QuipuswapV3,
//   storage: quipuswapV3Types.Storage,
//   tickIndices: Int[],
// ): Promise<void> {
//   const ticks = await storage.ticks.toMap();
//   const curTickIndex = storage.curTickIndex;
//   const expectedCurTickWitness = Math.max(...tickIndices.filter((t) => t <= curTickIndex));
//   equal(storage.curTickWitness, expectedCurTickWitness);

//   const liquiditiyAfterPriorTicks = tickIndices
//     .filter((t) => t <= curTickIndex)
//     .map((t) => ticks.get(t)!.liquidityNet)
//     .reduce((acc, cur) => acc.plus(cur), new BigNumber(0));
//   equal(storage.liquidity.toFixed(), liquiditiyAfterPriorTicks.toFixed());

//   const liquidityOfActivePositions = (await storage.positions.toMap()).reduce(
//     (acc, cur) => {
//       if (cur[1].lowerTickIndex <= curTickIndex && curTickIndex <= cur[1].upperTickIndex) {
//         return acc.plus(cur[1].liquidity);
//       }
//       return acc;
//     },
//     new BigNumber(0),
//   );
//   equal(storage.liquidity.toFixed(), liquidityOfActivePositions.toFixed());

//   const [sqrtPriceForCurTick, sqrtPriceForNextTick] = [
//     sqrtPriceFor(curTickIndex),
//     sqrtPriceFor(curTickIndex + 1),
//   ];
//   const inRange = (x: BigNumber) => {
//     return x.gte(sqrtPriceForCurTick) && x.lte(sqrtPriceForNextTick);
//   };
//   equal(inRange(storage.sqrtPrice), true);
// }
