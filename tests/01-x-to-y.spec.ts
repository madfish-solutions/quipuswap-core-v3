import { deepEqual, equal, ok, rejects, strictEqual } from "assert";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";

import { MichelsonMap, TezosToolkit, TransferParams } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { accounts } from "../sandbox/accounts";
import { QuipuswapV3 } from "@madfish/quipuswap-v3";
import {
  CallSettings,
  CallMode,
  swapDirection,
} from "@madfish/quipuswap-v3/dist/types";
import DexFactory from "./helpers/factoryFacade";
import env from "../env";
import { FA2 } from "./helpers/FA2";
import { FA12 } from "./helpers/FA12";
import { poolsFixture } from "./fixtures/poolFixture";
import { confirmOperation } from "../scripts/confirmation";
import { sendBatch, isInRangeNat } from "@madfish/quipuswap-v3/dist/utils";
import {
  adjustScale,
  liquidityDeltaToTokensDelta,
  sqrtPriceForTick,
  initTickAccumulators,
  tickAccumulatorsInside,
  shiftRight,
  calcSwapFee,
  calcNewPriceX,
  calcReceivedY,
  shiftLeft,
} from "@madfish/quipuswap-v3/dist/helpers/math";

import { checkAllInvariants } from "./helpers/invariants";
import { Int, Nat, quipuswapV3Types } from "@madfish/quipuswap-v3/dist/types";
import {
  advanceSecs,
  collectFees,
  compareStorages,
  cumulativesBuffer1,
  genFees,
  genNatIds,
  genNonOverlappingPositions,
  genSwapDirection,
  getTypedBalance,
  inRange,
  moreBatchSwaps,
  safeSwap,
  sleep,
  validDeadline,
} from "./helpers/utils";

const alice = accounts.alice;
const bob = accounts.bob;
const peter = accounts.peter;
const eve = accounts.eve;
const sara = accounts.sara;
const dave = accounts.dave;
const carol = accounts.carol;
const aliceSigner = new InMemorySigner(alice.sk);
const bobSigner = new InMemorySigner(bob.sk);
const peterSigner = new InMemorySigner(peter.sk);
const eveSigner = new InMemorySigner(eve.sk);
const carolSigner = new InMemorySigner(carol.sk);

const minTickIndex = new Int(-1048575);
const maxTickIndex = new Int(1048575);
const tickSpacing = 1;

describe("XtoY Tests", async () => {
  let poolFa12: QuipuswapV3;
  let poolFa2: QuipuswapV3;
  let poolFa1_2: QuipuswapV3;
  let poolFa2_1: QuipuswapV3;
  let tezos: TezosToolkit;
  let factory: DexFactory;
  let fa12TokenX: FA12;
  let fa12TokenY: FA12;
  let fa2TokenX: FA2;
  let fa2TokenY: FA2;
  before(async () => {
    tezos = new TezosToolkit(env.networks.development.rpc);
    tezos.setSignerProvider(aliceSigner);

    const {
      factory: _factory,
      fa12TokenX: _fa12TokenX,
      fa12TokenY: _fa12TokenY,
      fa2TokenX: _fa2TokenX,
      fa2TokenY: _fa2TokenY,
      poolFa12: _poolFa12,
      poolFa2: _poolFa2,
      poolFa1_2: _poolFa1_2,
      poolFa2_1: _poolFa2_1,
    } = await poolsFixture(tezos, [aliceSigner, bobSigner]);
    factory = _factory;
    fa12TokenX = _fa12TokenX;
    fa12TokenY = _fa12TokenY;
    fa2TokenX = _fa2TokenX;
    fa2TokenY = _fa2TokenY;
    poolFa12 = _poolFa12;
    poolFa2 = _poolFa2;
    poolFa1_2 = _poolFa1_2;
    poolFa2_1 = _poolFa2_1;

    let operation = await tezos.contract.transfer({
      to: peter.pkh,
      amount: 1e6,
      mutez: true,
    });

    await confirmOperation(tezos, operation.hash);
    operation = await tezos.contract.transfer({
      to: eve.pkh,
      amount: 1e6,
      mutez: true,
    });
    await confirmOperation(tezos, operation.hash);
  });
  describe("Failed cases", async () => {
    it.skip("Shouldn't swap if it's past the deadline", async () => {
      const liquidityProvider = aliceSigner;
      const swapper = bobSigner;
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const liquidity = new BigNumber(1e7);

        const lowerTickIndex = new Int(-1000);
        const upperTickIndex = new Int(1000);

        tezos.setSignerProvider(liquidityProvider);
        await pool.setPosition(
          lowerTickIndex,
          upperTickIndex,
          minTickIndex,
          minTickIndex,
          liquidity,
          validDeadline(),
          liquidity,
          liquidity,
        );

        tezos.setSignerProvider(swapper);
        await rejects(
          pool.swapXY(
            liquidity,
            Math.floor(Date.now() / 1001).toString(),
            new BigNumber(0),
            eve.pkh,
          ),
          (err: Error) => {
            equal(err.message.includes("103"), true);
            return true;
          },
        );
      }
    });
    it("Shouldn't swap if the user would receiver less than min_dy", async () => {
      const liquidityProvider = aliceSigner;
      const swapper = bobSigner;
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const liquidity = new BigNumber(1e7);

        const lowerTickIndex = new Int(-1000);
        const upperTickIndex = new Int(1000);

        tezos.setSignerProvider(liquidityProvider);
        await pool.setPosition(
          lowerTickIndex,
          upperTickIndex,
          minTickIndex,
          minTickIndex,
          liquidity,
          validDeadline(),
          liquidity,
          liquidity,
        );

        tezos.setSignerProvider(swapper);
        await rejects(
          pool.swapXY(
            new BigNumber(1),
            validDeadline(),
            new BigNumber(1000),
            eve.pkh,
          ),
          (err: Error) => {
            equal(err.message.includes("104"), true);
            return true;
          },
        );
      }
    });
  });
  it.skip("Should swapping within a single tick range", async () => {
    const liquidity = new BigNumber(1e7);
    const lowerTickIndex = new Int(-1000);
    const upperTickIndex = new Int(1000);
    const liquidityProvider = aliceSigner;
    const liquidityProviderAddr = alice.pkh;
    const swapper = bobSigner;
    const swapperAddr = bob.pkh;
    const swapReceiver = sara.pkh;
    const feeReceiver = carol.pkh;
    const {
      factory,
      fa12TokenX,
      fa12TokenY,
      fa2TokenX,
      fa2TokenY,
      poolFa12,
      poolFa2,
      poolFa1_2,
      poolFa2_1,
    } = await poolsFixture(tezos, [aliceSigner, bobSigner], genFees(4));

    const genSwaps = () => {
      const swaps: BigNumber[] = [];
      const swapCount = Math.round(Math.random() * 10);
      for (let i = 0; i < swapCount; i++) {
        swaps.push(new BigNumber(Math.round(Math.random() * 50000)));
      }
      return swaps;
    };

    for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
      tezos.setSignerProvider(aliceSigner);
      const initialSt = await pool.getRawStorage();
      const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
      const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
      const feeBps = initialSt.constants.fee_bps;
      await pool.increaseObservationCount(new BigNumber(10));

      await pool.setPosition(
        lowerTickIndex,
        upperTickIndex,
        new BigNumber(minTickIndex),
        new BigNumber(minTickIndex),
        liquidity,
        validDeadline(),
        liquidity,
        liquidity,
      );
      const swaps = genSwaps();
      tezos.setSignerProvider(swapper);
      for (const swapAmt of swaps) {
        const initSt = await pool.getStorage(
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            upperTickIndex,
            lowerTickIndex,
          ],
          genNatIds(50),
        );

        const initialBalanceSwapperX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          swapperAddr,
        );
        const initialBalanceSwapReceiverX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          swapReceiver,
        );
        const initialBalanceSwapperY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          swapperAddr,
        );
        const initialBalanceSwapReceiverY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          swapReceiver,
        );

        await pool.swapXY(
          swapAmt,
          validDeadline(),
          new BigNumber(0),
          swapReceiver,
        );

        // -- Advance the time 1 sec to make sure the buffer is updated to reflect the swaps.
        await advanceSecs(1, [pool]);

        const finalSt = await pool.getStorage(
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            upperTickIndex,
            lowerTickIndex,
          ],
          genNatIds(50),
        );
        // -- The contract's `sqrt_price` has moved accordingly.
        const expectedFee = calcSwapFee(feeBps, swapAmt);
        const expectedNewPrice = calcNewPriceX(
          initSt.sqrtPrice,
          initSt.liquidity,
          new Nat(swapAmt.minus(expectedFee)),
        );
        expect(
          adjustScale(finalSt.sqrtPrice, new Nat(80), new Nat(30)),
        ).to.be.deep.equal(
          adjustScale(expectedNewPrice, new Nat(80), new Nat(30)),
        );
        if (swapAmt.gt(0) && feeBps.gt(0)) {
          expect(expectedFee.gte(1)).to.be.true;
        }

        // -- Check fee growth
        const expectedFeeGrowthX = initSt.feeGrowth.x.plus(
          shiftLeft(expectedFee, new BigNumber(128))
            .div(initSt.liquidity)
            .integerValue(BigNumber.ROUND_FLOOR),
        );

        const expectedFeeGrowthY = new BigNumber(0);

        expect(finalSt.feeGrowth.x.toBignumber()).to.be.deep.equal(
          expectedFeeGrowthX.toBignumber(),
        );
        expect(finalSt.feeGrowth.y.toFixed()).to.be.deep.equal(
          expectedFeeGrowthY.toFixed(),
        );

        // The right amount of tokens was subtracted from the `swapper`'s balance
        const expectedDy = calcReceivedY(
          initSt.sqrtPrice,
          finalSt.sqrtPrice,
          initSt.liquidity,
        );

        const finalBalanceSwapperX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          swapperAddr,
        );
        const finalBalanceSwapReceiverX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          swapReceiver,
        );
        const finalBalanceSwapperY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          swapperAddr,
        );
        const finalBalanceSwapReceiverY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          swapReceiver,
        );

        expect(finalBalanceSwapperX.toFixed()).to.be.equal(
          initialBalanceSwapperX.minus(swapAmt).toFixed(),
        );
        expect(finalBalanceSwapperY.toFixed()).to.be.equal(
          initialBalanceSwapperY.toFixed(),
        );
        //-- The right amount of tokens was sent to the `receiver`.
        expect(finalBalanceSwapReceiverX.toFixed()).to.be.equal(
          initialBalanceSwapReceiverX.toFixed(),
        );
        expect(finalBalanceSwapReceiverY.toFixed()).to.be.equal(
          initialBalanceSwapReceiverY.plus(expectedDy).toFixed(),
        );
      }
      //`feeReceiver` receives the expected fees.
      tezos.setSignerProvider(liquidityProvider);
      const initialBalanceFeeReceiverX = await getTypedBalance(
        tezos,
        tokenTypeX,
        initialSt.constants.token_x,
        feeReceiver,
      );
      await collectFees(pool, feeReceiver, [new Nat(0)]);
      const finalBalanceFeeReceiverX = await getTypedBalance(
        tezos,
        tokenTypeX,
        initialSt.constants.token_x,
        feeReceiver,
      );
      const finalBalanceFeeReceiverY = await getTypedBalance(
        tezos,
        tokenTypeY,
        initialSt.constants.token_y,
        feeReceiver,
      );
      //`update_position` rounds the fee down, so it's possible 1 X token is lost.
      const expectedFees = swaps
        .map(dx => calcSwapFee(feeBps, dx))
        .reduce((a, b) => a.plus(b), new BigNumber(0));
      ok(
        isInRangeNat(
          finalBalanceFeeReceiverX,
          initialBalanceFeeReceiverX.plus(expectedFees),
          new Nat(1),
          new Nat(0),
        ),
      );
      expect(finalBalanceFeeReceiverY.toFixed()).to.be.equal("0");
    }
  });
  it.skip("Should placing many small swaps is (mostly) equivalent to placing 1 big swap", async () => {
    const liquidity = new BigNumber(1e7);
    const lowerTickIndex = new Int(-1000);
    const upperTickIndex = new Int(1000);
    const swapper = bobSigner;
    const swapReceiver = sara.pkh;
    const swapCount = 200;
    const swapAmt = new BigNumber(10);
    const {
      poolFa12,
      poolFa2,
      poolFa1_2,
      poolFa2_1,
      poolFa12Dublicate,
      poolFa2Dublicate,
      poolFa1_2Dublicate,
      poolFa2_1Dublicate,
    } = await poolsFixture(
      tezos,
      [aliceSigner, bobSigner],
      genFees(8, true),
      true,
    );

    for (const pools of [
      [poolFa12, poolFa12Dublicate],
      [poolFa2, poolFa2Dublicate],
      [poolFa1_2, poolFa1_2Dublicate],
      [poolFa2_1, poolFa2_1Dublicate],
    ]) {
      const rawSt = await pools[0].getRawStorage();
      tezos.setSignerProvider(aliceSigner);
      const pool_1: QuipuswapV3 = pools[0];
      const pool_2: QuipuswapV3 = pools[1];
      const initialSt = await pool_1.getRawStorage();
      const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
      const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];

      pool_1.callSettings.increaseObservationCount = CallMode.returnParams;
      pool_2.callSettings.increaseObservationCount = CallMode.returnParams;
      pool_1.callSettings.setPosition = CallMode.returnParams;
      pool_2.callSettings.setPosition = CallMode.returnParams;

      let transferParams: any[] = [];
      transferParams.push(
        await pool_1.increaseObservationCount(new BigNumber(10)),
      );
      transferParams.push(
        await pool_2.increaseObservationCount(new BigNumber(10)),
      );
      let batchOp = await sendBatch(tezos, transferParams);
      await confirmOperation(tezos, batchOp.opHash);
      transferParams = [];
      transferParams.push(
        await pool_1.setPosition(
          lowerTickIndex,
          upperTickIndex,
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          liquidity,
          validDeadline(),
          liquidity,
          liquidity,
        ),
      );
      transferParams.push(
        await pool_2.setPosition(
          lowerTickIndex,
          upperTickIndex,
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          liquidity,
          validDeadline(),
          liquidity,
          liquidity,
        ),
      );
      batchOp = await sendBatch(tezos, transferParams);
      await confirmOperation(tezos, batchOp.opHash);

      tezos.setSignerProvider(swapper);
      transferParams = [];
      // 1 big swap
      pool_1.callSettings.swapXY = CallMode.returnParams;
      pool_2.callSettings.swapXY = CallMode.returnParams;
      transferParams.push(
        await pool_1.swapXY(
          swapAmt.multipliedBy(swapCount),
          validDeadline(),
          new BigNumber(0),
          swapReceiver,
        ),
      );
      // many small swaps
      transferParams.push(
        ...(await moreBatchSwaps(
          pool_2,
          swapCount,
          swapAmt,
          new BigNumber(1),
          await swapper.publicKeyHash(),
          "XtoY",
        )),
      );

      batchOp = await sendBatch(tezos, transferParams);
      await confirmOperation(tezos, batchOp.opHash);
      // -- Advance the time 1 sec to make sure the buffer is updated to reflect the swaps.
      await advanceSecs(1, [pool_1, pool_2]);
      await checkAllInvariants(
        pool_1,
        { [alice.pkh]: aliceSigner },
        [new Nat(0), new Nat(1), new Nat(2)],
        [
          new Int(minTickIndex),
          new Int(maxTickIndex),
          lowerTickIndex,
          upperTickIndex,
        ],
        genNatIds(250),
      );
      await checkAllInvariants(
        pool_2,
        { [alice.pkh]: aliceSigner },
        [new Nat(0), new Nat(1), new Nat(2)],
        [
          new Int(minTickIndex),
          new Int(maxTickIndex),
          lowerTickIndex,
          upperTickIndex,
        ],
        genNatIds(250),
      );
      /**
       * The two storages should be mostly identical.
       * The price might be slightly different, due to the compounding of rounding errors,
       * so we take some precision away to account for this difference.
       */
      const st1 = await pool_1.getStorage(
        [new Nat(0)],
        [
          new Int(minTickIndex),
          new Int(maxTickIndex),
          lowerTickIndex,
          upperTickIndex,
        ],
        genNatIds(250),
      );
      const st2 = await pool_2.getStorage(
        [new Nat(0)],
        [
          new Int(minTickIndex),
          new Int(maxTickIndex),
          lowerTickIndex,
          upperTickIndex,
        ],
        genNatIds(250),
      );
      const sqrtPrice_1 = adjustScale(st1.sqrtPrice, new Nat(80), new Nat(60));
      const sqrtPrice_2 = adjustScale(st2.sqrtPrice, new Nat(80), new Nat(60));
      expect(sqrtPrice_1).to.be.deep.equal(sqrtPrice_2);
      expect(st1.curTickIndex.toFixed()).to.be.equal(
        st2.curTickIndex.toFixed(),
      );
      st1.sqrtPrice = new quipuswapV3Types.x80n(sqrtPrice_1);
      st2.sqrtPrice = new quipuswapV3Types.x80n(sqrtPrice_2);
      compareStorages(st1, st2);

      const cfmm1XBalance = await getTypedBalance(
        tezos,
        tokenTypeX,
        rawSt.constants.token_x,
        pool_1.contract.address,
      );
      const cfmm1YBalance = await getTypedBalance(
        tezos,
        tokenTypeY,
        rawSt.constants.token_y,
        pool_1.contract.address,
      );
      const cfmm2XBalance = await getTypedBalance(
        tezos,
        tokenTypeX,
        rawSt.constants.token_x,
        pool_2.contract.address,
      );
      const cfmm2YBalance = await getTypedBalance(
        tezos,
        tokenTypeY,

        rawSt.constants.token_y,
        pool_2.contract.address,
      );
      /**
       * Due to `dy` being rounded down, it's possible the swapper loses *up to* 1 Y token
       * on every swap.
       * So the 2nd contract may hold up to 1000 more Y tokens than the 1st contract.
       */
      ok(
        isInRangeNat(
          cfmm2YBalance,
          cfmm1YBalance,
          new Nat(0),
          new Nat(swapCount),
        ),
      );
      expect(cfmm1XBalance.toFixed()).to.be.equal(cfmm2XBalance.toFixed());
    }
  });
});
