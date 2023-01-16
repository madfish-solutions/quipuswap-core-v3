import { equal, ok, rejects } from "assert";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";

import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { accounts } from "../sandbox/accounts";
import { QuipuswapV3 } from "@madfish/quipuswap-v3";
import { CallMode } from "@madfish/quipuswap-v3/dist/types";
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
  calcSwapFee,
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
  genFees,
  genNatIds,
  getTypedBalance,
  moreBatchSwaps,
  validDeadline,
} from "./helpers/utils";

const alice = accounts.alice;
const bob = accounts.bob;
const peter = accounts.peter;
const eve = accounts.eve;
const sara = accounts.sara;
const carol = accounts.carol;
const aliceSigner = new InMemorySigner(alice.sk);
const bobSigner = new InMemorySigner(bob.sk);

const minTickIndex = new Int(-1048575);
const maxTickIndex = new Int(1048575);

describe("YtoX Tests", async () => {
  let poolFa12: QuipuswapV3;
  let poolFa2: QuipuswapV3;
  let poolFa1_2: QuipuswapV3;
  let poolFa2_1: QuipuswapV3;
  let tezos: TezosToolkit;
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
  });
  describe("Success cases", async function () {
    it("Should swapping within a single tick range", async () => {
      const liquidity = new BigNumber(1e7);
      const lowerTickIndex = new Int(-1000);
      const upperTickIndex = new Int(1000);
      const liquidityProvider = aliceSigner;
      const liquidityProviderAddr = alice.pkh;
      const swapper = bobSigner;
      const swapperAddr = bob.pkh;
      const swapReceiver = sara.pkh;
      const feeReceiver = carol.pkh;
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner],
        0,
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
          expect(
            adjustScale(finalSt.sqrtPrice, new Nat(80), new Nat(30)),
          ).to.be.deep.equal(
            adjustScale(expectedNewPrice, new Nat(80), new Nat(30)),
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
        0,
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
    it("Should swaps are no-ops, after crossing into a 0-liquidity range", async () => {
      const liquidity = new BigNumber(1e4);
      const lowerTickIndex = new Int(-100);
      const upperTickIndex = new Int(100);
      const liquidityProvider = aliceSigner;
      const swapper = bobSigner;
      const swapperAddr = bob.pkh;

      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner],
        0,
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
        //xtoy cfmm 200 swapper
        pool.callSettings.swapXY = CallMode.returnParams;
        transferParams.push(
          await pool.swapXY(
            new BigNumber(200),
            validDeadline(),
            new BigNumber(0),
            swapperAddr,
          ),
        );
        let batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);
        pool.callSettings.swapXY = CallMode.returnConfirmatedOperation;
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
        let initialBalance = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
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
        let finalBalance = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool.contract.address,
        );
        compareStorages(initialSt, finalSt, true);
        expect(initialBalance.toFixed()).to.be.equal(finalBalance.toFixed());

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
        initialBalance = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool.contract.address,
        );
        await pool.swapXY(
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
        finalBalance = await getTypedBalance(
          pool.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool.contract.address,
        );
        compareStorages(initialSt, finalSt, true);
        expect(finalBalance).to.be.deep.eq(initialBalance);
      }
    });
    it("Should executing a swap within a single tick range or across many ticks should be (mostly) equivalent", async () => {
      const liquidity = new BigNumber(1e6);
      const lowerTickIndex = new Int(-1000);
      const upperTickIndex = new Int(1000);
      const waitTime = 3;
      const swapper = bobSigner;

      const feeReceiver1 = sara.pkh;
      const feeReceiver2 = peter.pkh;

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
        0,
        [200, 200, 200, 200, 200, 200, 200, 200],
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

        const initialBalanceFeeReceiverX = await getTypedBalance(
          pool_1.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          feeReceiver1,
        );
        const initialBalanceFeeReceiverY = await getTypedBalance(
          pool_1.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          feeReceiver1,
        );
        const initialBalanceFeeReceiverX2 = await getTypedBalance(
          pool_1.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          feeReceiver2,
        );
        const initialBalanceFeeReceiverY2 = await getTypedBalance(
          pool_1.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          feeReceiver2,
        );

        pool_1.callSettings.increaseObservationCount = CallMode.returnParams;
        pool_2.callSettings.increaseObservationCount = CallMode.returnParams;
        pool_1.callSettings.setPosition = CallMode.returnParams;
        pool_2.callSettings.setPosition = CallMode.returnParams;

        // Add some slots to the buffers to make the tests more meaningful.
        let transferParams: any[] = [];
        transferParams.push(
          await pool_1.increaseObservationCount(new BigNumber(10)),
        );
        transferParams.push(
          await pool_2.increaseObservationCount(new BigNumber(10)),
        );
        // let batchOp = await sendBatch(tezos, transferParams);
        // await confirmOperation(tezos, batchOp.opHash);
        /**

      -- Place many small positions with the same liquidity
      for_ [-1000, -900 .. 900] \lowerTickIndex' -> do
        setPosition cfmm2 liquidity (lowerTickIndex', lowerTickIndex' + 100)
       */
        //transferParams = [];

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
        let knownedIndexes: Int[] = [];
        for (
          let lowerTickIndex = -1000;
          lowerTickIndex <= 900;
          lowerTickIndex += 100
        ) {
          knownedIndexes.push(new Int(lowerTickIndex));
          knownedIndexes.push(new Int(lowerTickIndex + 100));

          transferParams.push(
            await pool_2.setPosition(
              new Int(lowerTickIndex),
              new Int(lowerTickIndex + 100),
              new BigNumber(minTickIndex),
              new BigNumber(minTickIndex),
              liquidity,
              validDeadline(),
              liquidity,
              liquidity,
            ),
          );
        }
        let batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);
        transferParams = [];

        // batchOp = await sendBatch(tezos, transferParams);
        // await confirmOperation(tezos, batchOp.opHash);
        // -- Advance the time 1 sec to make sure the buffer is updated to reflect the swaps.

        await checkAllInvariants(
          pool_1,
          { [alice.pkh]: aliceSigner },
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            lowerTickIndex,
            upperTickIndex,
          ],
          genNatIds(100),
        );
        await checkAllInvariants(
          pool_2,
          { [alice.pkh]: aliceSigner },
          genNatIds(100),
          [new Int(minTickIndex), new Int(maxTickIndex), ...knownedIndexes],
          genNatIds(100),
        );

        const pool1InitialBalanceX = await getTypedBalance(
          pool_1.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool_1.contract.address,
        );
        const pool1InitialBalanceY = await getTypedBalance(
          pool_1.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          pool_1.contract.address,
        );
        const pool2InitialBalanceX = await getTypedBalance(
          pool_2.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool_2.contract.address,
        );
        const pool2InitialBalanceY = await getTypedBalance(
          pool_2.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          pool_2.contract.address,
        );
        tezos.setSignerProvider(swapper);
        transferParams = [];

        //Place a small swap to move the tick past 0 and advance the time to fill the
        //buffer with _something_ other than zeros.
        pool_1.callSettings.swapXY = CallMode.returnParams;
        pool_2.callSettings.swapXY = CallMode.returnParams;

        transferParams.push(
          await pool_1.swapXY(
            new BigNumber(200),
            validDeadline(),
            new BigNumber(0),
            await swapper.publicKeyHash(),
          ),
        );
        transferParams.push(
          await pool_2.swapXY(
            new BigNumber(200),
            validDeadline(),
            new BigNumber(0),
            await swapper.publicKeyHash(),
          ),
        );
        batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);
        await advanceSecs(waitTime, [pool_1, pool_2]);

        transferParams = [];
        //Place 1 big swap to push the tick all the way down to `lowerTickIndex`
        transferParams.push(
          await pool_1.swapXY(
            new BigNumber(50000),
            validDeadline(),
            new BigNumber(0),
            await swapper.publicKeyHash(),
          ),
        );
        transferParams.push(
          await pool_2.swapXY(
            new BigNumber(50000),
            validDeadline(),
            new BigNumber(0),
            await swapper.publicKeyHash(),
          ),
        );

        batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);

        //Advance the time 1 sec to make sure the buffer is updated to reflect the swaps.
        await advanceSecs(waitTime, [pool_1, pool_2]);

        await checkAllInvariants(
          pool_1,
          { [alice.pkh]: aliceSigner },
          genNatIds(50),
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            lowerTickIndex,
            upperTickIndex,
          ],
          genNatIds(100),
        );
        await checkAllInvariants(
          pool_2,
          { [alice.pkh]: aliceSigner },
          genNatIds(50),
          [new Int(minTickIndex), new Int(maxTickIndex), ...knownedIndexes],
          genNatIds(100),
        );

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
          genNatIds(50),
          [new Int(minTickIndex), new Int(maxTickIndex), ...knownedIndexes],
          genNatIds(250),
        );

        //Sanity check: In order for this test to be meaningful, we need the `curTickIndex`
        //to have moved close to `lowerTickIndex` and have crossed several initialized ticks.
        ok(st1.curTickIndex.gte(lowerTickIndex) && st1.curTickIndex.lte(50));

        //Current tick should be the same.
        expect(st1.curTickIndex.toFixed()).to.be.eq(st2.curTickIndex.toFixed());

        /**
         * Fee growth" should be fairly similar.
         * It can be slightly higher for the 2nd contract,
         * because each time we cross an initialized tick, the fee can be rounded up once.
         * Because in the 2nd scenario we're crossing 10 ticks, we allow for a difference of up to 10 extra X tokens in fees.
         */
        const feeGrowthX1 = st1.feeGrowth.x;
        const feeGrowthX2 = st2.feeGrowth.x;
        const feeGrowthY1 = st1.feeGrowth.y;
        const feeGrowthY2 = st2.feeGrowth.y;

        expect(feeGrowthY1.toFixed()).to.be.eq("0");
        expect(feeGrowthY2.toFixed()).to.be.eq("0");

        const marginOfError = new BigNumber(10)
          .multipliedBy(2 ** 128)
          .div(liquidity);
        ok(
          isInRangeNat(
            feeGrowthX2.toBignumber(),
            feeGrowthX1.toBignumber(),
            new Nat(0),
            marginOfError,
          ),
        );

        const pool1FinalBalanceX = await getTypedBalance(
          pool_1.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool_1.contract.address,
        );
        const pool1FinalBalanceY = await getTypedBalance(
          pool_1.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          pool_1.contract.address,
        );
        const pool2FinalBalanceX = await getTypedBalance(
          pool_2.tezos,
          tokenTypeX,
          rawSt.constants.token_x,
          pool_2.contract.address,
        );
        const pool2FinalBalanceY = await getTypedBalance(
          pool_2.tezos,
          tokenTypeY,
          rawSt.constants.token_y,
          pool_2.contract.address,
        );

        const delta1X = pool1FinalBalanceX.minus(pool1InitialBalanceX);
        const delta1Y = pool1FinalBalanceY.minus(pool1InitialBalanceY);
        const delta2X = pool2FinalBalanceX.minus(pool2InitialBalanceX);
        const delta2Y = pool2FinalBalanceY.minus(pool2InitialBalanceY);

        //The two contract should have received the exact same amount of X tokens
        expect(delta1X.toFixed()).to.be.eq(delta2X.toFixed());

        //The 2nd contract may have given out fewer Y tokens (due to the potential increase in fees)
        ok(isInRange(delta2Y, delta1Y, new BigNumber(0), new BigNumber(10)));

        /**
         * Collected fees should be fairly similar.
         * As explained above, the contract may charge up to 10 extra tokens.
         * However, when an LP collects fees for a position, the distribution of fees can be rounded down,
         * so we allow for a margin of error of +/-10 X tokens.
         */
        await collectFees(pool_1, feeReceiver1, genNatIds(10));
        await collectFees(pool_2, feeReceiver2, genNatIds(10));

        const feeReceiver1BalanceX = (
          await getTypedBalance(
            pool_1.tezos,
            tokenTypeX,
            rawSt.constants.token_x,
            feeReceiver1,
          )
        ).minus(initialBalanceFeeReceiverX);
        const feeReceiver1BalanceY = (
          await getTypedBalance(
            pool_1.tezos,
            tokenTypeY,
            rawSt.constants.token_y,
            feeReceiver1,
          )
        ).minus(initialBalanceFeeReceiverY);
        const feeReceiver2BalanceX = (
          await getTypedBalance(
            pool_2.tezos,
            tokenTypeX,
            rawSt.constants.token_x,
            feeReceiver2,
          )
        ).minus(initialBalanceFeeReceiverX2);
        const feeReceiver2BalanceY = (
          await getTypedBalance(
            pool_2.tezos,
            tokenTypeY,
            rawSt.constants.token_y,
            feeReceiver2,
          )
        ).minus(initialBalanceFeeReceiverY2);

        expect(feeReceiver1BalanceY.toFixed()).to.be.eq("0");
        expect(feeReceiver2BalanceY.toFixed()).to.be.eq("0");
        ok(
          isInRangeNat(
            feeReceiver2BalanceX,
            feeReceiver1BalanceX,
            new Nat(10),
            new Nat(10),
          ),
        );

        // The global accumulators of both contracts should be the same.
        expect(st1.cumulativesBuffer.map.map).to.be.deep.eq(
          st2.cumulativesBuffer.map.map,
        );
        expect(st1.cumulativesBuffer.first.toFixed).to.be.eq(
          st2.cumulativesBuffer.first.toFixed,
        );
        expect(st1.cumulativesBuffer.last.toFixed).to.be.eq(
          st2.cumulativesBuffer.last.toFixed,
        );
        expect(st1.cumulativesBuffer.reservedLength.toFixed).to.be.eq(
          st2.cumulativesBuffer.reservedLength.toFixed,
        );

        // Check that the ticks' states were updated correctly after being crossed.
        let crossedTicks: quipuswapV3Types.TickState[] = [];
        for (
          let lowerTickIndex = -900;
          lowerTickIndex <= -100;
          lowerTickIndex += 100
        ) {
          crossedTicks.push(st2.ticks.get(new Int(lowerTickIndex)));
        }

        for (const ts of crossedTicks) {
          // expect(ts.secondsPerLiquidityOutside.toFixed()).to.be.eq(
          //   new Nat(waitTime).div(new Nat(liquidity)).toFixed(),
          // );
          // expect(ts.secondsOutside.toFixed()).to.be.eq(
          //   new Nat(waitTime).toFixed(),
          // );
          // expect(ts.tickCumulativeOutside.toFixed()).to.be.eq(
          //   lowerTickIndex.multipliedBy(waitTime).toFixed(),
          // );
          expect(ts.feeGrowthOutside.x.toFixed()).to.be.not.eq("0");
          //expect(ts.feeGrowthOutside.y.toFixed()).to.be.not.eq("0");
        }
      }
    });
    it("Should allow invariants hold when pushing the cur_tick_index just below cur_tick_witness", async () => {
      const liquidity = new BigNumber(1e4);
      const lowerTickIndex = new Int(-100);
      const upperTickIndex = new Int(100);
      const liquidityProvider = aliceSigner;

      const swapper = bobSigner;
      const swapperAddr = bob.pkh;

      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner],
        0,
        genFees(4, true),
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
            new Int(-200),
            new Int(-100),
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
          await pool.swapXY(
            new BigNumber(51),
            validDeadline(),
            new BigNumber(1),
            swapperAddr,
          ),
        );
        tezos.setSignerProvider(swapper);
        /**
         * Explanation:
         * We have 2 positions: one currently in-range with boundaries at [-100, 100],
         * and another currently out-of-range with boundaries at [-200, -100].
         * If we deposit 52 X tokens, the cur_tick_index would move to -100 but NOT cross it.
         * If we deposit 53 X tokens, we'll exhaust the first position's liquidity,
         * and therefore cross the tick -100.
         * After having crossed the tick, we'll have 1 X token left to swap.
         * But since a 1 token fee will be charged, 0 X tokens will be
         * deposited and 0 Y tokens will be withdrawn.
         * We want to make sure invariants are not broken when this edge case occurs.
         */

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
        expect(st.curTickIndex.toFixed()).to.be.eq("-101");
        await checkAllInvariants(
          pool,
          [],
          [new Nat(0), new Nat(1)],
          [
            new Int(-100),
            new Int(-101),
            new Int(100),
            new Int(-200),
            minTickIndex,
            maxTickIndex,
          ],
          genNatIds(10),
        );
      }
    });
  });
});
