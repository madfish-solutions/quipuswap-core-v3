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
import {
  sendBatch,
  isInRangeNat,
  isInRange,
} from "@madfish/quipuswap-v3/dist/utils";
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
  calcNewPriceY,
  calcReceivedX,
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

describe("YtoX Tests", async () => {
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

    // let operation = await tezos.contract.transfer({
    //   to: peter.pkh,
    //   amount: 1e6,
    //   mutez: true,
    // });

    // await confirmOperation(tezos, operation.hash);
    // operation = await tezos.contract.transfer({
    //   to: eve.pkh,
    //   amount: 1e6,
    //   mutez: true,
    // });
    // await confirmOperation(tezos, operation.hash);
  });
  describe("Failed cases", async () => {
    it("Shouldn't swap if it's past the deadline", async () => {
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
          pool.swapYX(
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
    it("Shouldn't swap if the user would receiver less than min_dx", async function () {
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
          pool.swapYX(
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
  describe("Success cases", async () => {
    it.skip("Should swapping within a single tick range", async () => {
      const liquidity = new BigNumber(1e7);
      const lowerTickIndex = new Int(-1000);
      const upperTickIndex = new Int(1000);
      const liquidityProvider = aliceSigner;
      const swapper = bobSigner;
      const swapperAddr = bob.pkh;
      const swapReceiver = sara.pkh;
      const feeReceiver = carol.pkh;
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner],
        genFees(4),
      );

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

          await pool.swapYX(
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
          const expectedNewPrice = calcNewPriceY(
            initSt.sqrtPrice,
            initSt.liquidity,
            new Nat(swapAmt.minus(expectedFee)),
          );
          console.log(expectedNewPrice);
          console.log(swapAmt.minus(expectedFee));
          expect(
            adjustScale(finalSt.sqrtPrice, new Nat(80), new Nat(30)).toFixed(),
          ).to.be.equal(
            adjustScale(expectedNewPrice, new Nat(80), new Nat(30)).toFixed(),
          );
          if (swapAmt.gt(0) && feeBps.gt(0)) {
            expect(expectedFee.gte(1)).to.be.true;
          }

          // -- Check fee growth
          const expectedFeeGrowthY = initSt.feeGrowth.y.plus(
            shiftLeft(expectedFee, new BigNumber(128))
              .div(initSt.liquidity)
              .integerValue(BigNumber.ROUND_FLOOR),
          );

          const expectedFeeGrowthX = new BigNumber(0);

          expect(finalSt.feeGrowth.x.toFixed()).to.be.equal(
            expectedFeeGrowthX.toFixed(),
          );
          expect(finalSt.feeGrowth.y.toFixed()).to.be.equal(
            expectedFeeGrowthY.toFixed(),
          );

          // The right amount of tokens was subtracted from the `swapper`'s balance
          const expectedDx = calcReceivedX(
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

          expect(finalBalanceSwapperY.toFixed()).to.be.equal(
            initialBalanceSwapperY.minus(swapAmt).toFixed(),
          );
          expect(finalBalanceSwapperX.toFixed()).to.be.equal(
            initialBalanceSwapperX.toFixed(),
          );
          //-- The right amount of tokens was sent to the `receiver`.
          expect(finalBalanceSwapReceiverY.toFixed()).to.be.equal(
            initialBalanceSwapReceiverY.toFixed(),
          );
          expect(finalBalanceSwapReceiverX.toFixed()).to.be.equal(
            initialBalanceSwapReceiverX.plus(expectedDx).toFixed(),
          );
        }
        //`feeReceiver` receives the expected fees.
        tezos.setSignerProvider(liquidityProvider);
        const initialBalanceFeeReceiverY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
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
            finalBalanceFeeReceiverY,
            initialBalanceFeeReceiverY.plus(expectedFees),
            new Nat(1),
            new Nat(0),
          ),
        );
        expect(finalBalanceFeeReceiverX.toFixed()).to.be.equal("0");
      }
    });
    it("Should placing many small swaps is (mostly) equivalent to placing 1 big swap", async () => {
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
        pool_1.callSettings.swapYX = CallMode.returnParams;
        pool_2.callSettings.swapYX = CallMode.returnParams;
        transferParams.push(
          await pool_1.swapYX(
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
            "YtoX",
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
        const sqrtPrice_1 = adjustScale(
          st1.sqrtPrice,
          new Nat(80),
          new Nat(60),
        );
        const sqrtPrice_2 = adjustScale(
          st2.sqrtPrice,
          new Nat(80),
          new Nat(60),
        );
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
            cfmm2XBalance,
            cfmm1XBalance,
            new Nat(0),
            new Nat(swapCount),
          ),
        );
        expect(cfmm1YBalance.toFixed()).to.be.equal(cfmm2YBalance.toFixed());
      }
    });
    it("Should swaps are no-ops, after crossing into a 0-liquidity range", async function () {
      this.retries(3);
      const liquidity = new BigNumber(1e4);
      const lowerTickIndex = new Int(-100);
      const upperTickIndex = new Int(100);
      const liquidityProvider = aliceSigner;

      const swapper = bobSigner;
      const swapperAddr = bob.pkh;

      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner],
        genFees(4, true),
      );

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const rawSt = await pool.getRawStorage();
        tezos.setSignerProvider(liquidityProvider);
        const tokenTypeX = Object.keys(rawSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(rawSt.constants.token_y)[0];
        let transferParams: any[] = [];
        pool.callSettings.setPosition = CallMode.returnParams;
        transferParams.push(
          await pool.setPosition(
            lowerTickIndex,
            upperTickIndex,
            minTickIndex,
            minTickIndex,
            liquidity,
            validDeadline(),
            liquidity,
            liquidity,
          ),
        );

        tezos.setSignerProvider(swapper);
        //-- Place a swap big enough to exhaust the position's liquidity
        pool.callSettings.swapYX = CallMode.returnParams;

        transferParams.push(
          await pool.swapYX(
            new BigNumber(200),
            validDeadline(),
            new BigNumber(0),
            swapperAddr,
          ),
        );
        pool.callSettings.swapYX = CallMode.returnConfirmatedOperation;
        let batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);

        let initialSt = await pool.getStorage(
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            lowerTickIndex,
            upperTickIndex,
          ],
          genNatIds(50),
        );
        let initialBalanceX = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool.contract.address,
        );
        let initialBalanceY = await getTypedBalance(
          pool.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          pool.contract.address,
        );

        await pool.swapXY(
          new BigNumber(100),
          validDeadline(),
          new BigNumber(0),
          swapperAddr,
        );

        let finalSt = await pool.getStorage(
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            lowerTickIndex,
            upperTickIndex,
          ],
          genNatIds(50),
        );
        let finalBalanceX = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool.contract.address,
        );
        let finalBalanceY = await getTypedBalance(
          pool.tezos,
          tokenTypeY,
          rawSt.constants.token_y,

          pool.contract.address,
        );

        compareStorages(initialSt, finalSt, true);
        expect(initialBalanceX.toFixed()).to.be.equal(finalBalanceX.toFixed());
        expect(initialBalanceY.toFixed()).to.be.equal(finalBalanceY.toFixed());

        initialSt = await pool.getStorage(
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            lowerTickIndex,
            upperTickIndex,
          ],
          genNatIds(50),
        );
        initialBalanceX = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool.contract.address,
        );
        initialBalanceY = await getTypedBalance(
          pool.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          pool.contract.address,
        );

        await pool.swapYX(
          new BigNumber(100),
          validDeadline(),
          new BigNumber(0),
          swapperAddr,
        );
        finalSt = await pool.getStorage(
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            lowerTickIndex,
            upperTickIndex,
          ],
          genNatIds(50),
        );
        finalBalanceX = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool.contract.address,
        );
        finalBalanceY = await getTypedBalance(
          pool.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          pool.contract.address,
        );

        compareStorages(initialSt, finalSt, true);
        expect(finalBalanceX).to.be.deep.eq(initialBalanceX);
        expect(finalBalanceY).to.be.deep.eq(initialBalanceY);
      }
    });
    it("Should allow invariants hold when pushing the cur_tick_index just below cur_tick_witness", async function () {
      this.retries(3);
      const lowerTickIndex = new Int(-100);
      const upperTickIndex = new Int(100);
      const liquidityProvider = aliceSigner;

      const swapper = bobSigner;
      const swapperAddr = bob.pkh;

      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner],
        [200, 200, 200, 200],
      );

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const rawSt = await pool.getRawStorage();
        tezos.setSignerProvider(liquidityProvider);
        const tokenTypeX = Object.keys(rawSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(rawSt.constants.token_y)[0];
        let transferParams: any[] = [];
        pool.callSettings.setPosition = CallMode.returnParams;
        //pool.callSettings.swapXY = CallMode.returnParams;
        transferParams.push(
          await pool.setPosition(
            new Int(-100),
            new Int(100),
            minTickIndex,
            minTickIndex,
            new BigNumber(1e4),
            validDeadline(),
            new BigNumber(1e4),
            new BigNumber(1e4),
          ),
        );
        transferParams.push(
          await pool.setPosition(
            new Int(100),
            new Int(200),
            minTickIndex,
            minTickIndex,
            new BigNumber(3e4),
            validDeadline(),
            new BigNumber(3e4),
            new BigNumber(3e4),
          ),
        );

        let batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);
        transferParams.push(
          await pool.swapYX(
            new BigNumber(57),
            validDeadline(),
            new BigNumber(1),
            swapperAddr,
          ),
        );
        tezos.setSignerProvider(swapper);

        const st = await pool.getStorage(
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            lowerTickIndex,
            upperTickIndex,
          ],
          genNatIds(50),
        );
        expect(st.curTickIndex.toFixed()).to.be.eq("101");
        await checkAllInvariants(
          pool,
          [],
          [new Nat(0), new Nat(1)],
          [
            minTickIndex,
            new Int(-100),
            new Int(100),
            new Int(200),
            maxTickIndex,
          ],
          genNatIds(10),
        );
      }
    });
    it("Should assigning correctly fees to each position", async function () {
      this.retries(3);
      const liquidityProvider = aliceSigner;
      const swapper = bobSigner;
      const swapperAddr = bob.pkh;
      const feeReceiver1 = sara.pkh;
      const feeReceiver2 = carol.pkh;

      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner],
        [5000, 5000, 5000, 5000],
      );

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const rawSt = await pool.getRawStorage();
        tezos.setSignerProvider(liquidityProvider);
        const tokenTypeX = Object.keys(rawSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(rawSt.constants.token_y)[0];
        let transferParams: any[] = [];
        pool.callSettings.setPosition = CallMode.returnParams;
        transferParams.push(
          await pool.setPosition(
            new Int(-100),
            new Int(100),
            minTickIndex,
            minTickIndex,
            new BigNumber(1e6),
            validDeadline(),
            new BigNumber(1e6),
            new BigNumber(1e6),
          ),
          await pool.setPosition(
            new Int(100),
            new Int(200),
            minTickIndex,
            minTickIndex,
            new BigNumber(1e6),
            validDeadline(),
            new BigNumber(1e6),
            new BigNumber(1e6),
          ),
        );
        let batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);
        transferParams = [];
        tezos.setSignerProvider(swapper);
        //Place a small x-to-y swap.
        //It's small enough to be executed within the [-100, 100] range,
        //so the X fee is paid to position1 only.

        pool.callSettings.swapXY = CallMode.returnParams;
        pool.callSettings.swapYX = CallMode.returnParams;
        transferParams.push(
          await pool.swapXY(
            new BigNumber(1000),
            validDeadline(),
            new BigNumber(0),
            swapperAddr,
          ),
        );
        //Place a big y-to-x swap.
        //It's big enough to cross from the [-100, 100] range into the [100, 200] range,
        //so the Y fee is paid to both position1 and position2.
        transferParams.push(
          await pool.swapYX(
            new BigNumber(20000),
            validDeadline(),
            new BigNumber(0),
            swapperAddr,
          ),
        );
        batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);
        pool.callSettings.swapXY = CallMode.returnConfirmatedOperation;
        await checkAllInvariants(
          pool,
          [liquidityProvider],
          genNatIds(2),
          [
            minTickIndex,
            new Int(-100),
            new Int(100),
            new Int(200),
            maxTickIndex,
          ],
          genNatIds(50),
        );

        // position1 should have earned both X and Y fees.
        tezos.setSignerProvider(liquidityProvider);
        await collectFees(pool, feeReceiver1, [new Nat(0)]);
        const balanceFeeReceiverX_1 = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          feeReceiver1,
        );
        const balanceFeeReceiverY_1 = await getTypedBalance(
          pool.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          feeReceiver1,
        );

        expect(balanceFeeReceiverX_1.toFixed()).to.be.not.eq("0");
        expect(balanceFeeReceiverY_1.toFixed()).to.be.not.eq("0");

        // position2 should have earned X fees only.
        await collectFees(pool, feeReceiver2, [new Nat(1)]);
        const balanceFeeReceiverX_2 = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          feeReceiver2,
        );
        const balanceFeeReceiverY_2 = await getTypedBalance(
          pool.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          feeReceiver2,
        );

        expect(balanceFeeReceiverX_2.toFixed()).to.be.eq("0");
        expect(balanceFeeReceiverY_2.toFixed()).to.be.not.eq("0");
      }
    });
  });
});
