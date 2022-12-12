import { deepEqual, equal, ok, rejects, strictEqual } from "assert";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";

import { MichelsonMap, TezosToolkit, TransferParams } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { accounts } from "../sandbox/accounts";
import { QuipuswapV3 } from "@madfish/quipuswap-v3";
import { CallSettings, CallMode } from "@madfish/quipuswap-v3/dist/types";
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

const minTickIndex = -1048575;
const maxTickIndex = 1048575;
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
          new Nat(feeBps),
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
  // describe("Success cases", async () => {
  //   it.skip("Should depositing and withdrawing the same amount of liquidity+", async () => {
  //     tezos.setSignerProvider(aliceSigner);
  //     const {
  //       factory: _factory,
  //       fa12TokenX: _fa12TokenX,
  //       fa12TokenY: _fa12TokenY,
  //       fa2TokenX: _fa2TokenX,
  //       fa2TokenY: _fa2TokenY,
  //       poolFa12: _poolFa12,
  //       poolFa2: _poolFa2,
  //       poolFa1_2: _poolFa1_2,
  //       poolFa2_1: _poolFa2_1,
  //     } = await poolsFixture(tezos, [aliceSigner], genFees(4, true));
  //     for (const pool of [_poolFa12, _poolFa2, _poolFa1_2, _poolFa2_1]) {
  //       const initialSt = await pool.getRawStorage();
  //       const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
  //       const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
  //       await pool.setPosition(
  //         new BigNumber(-10),
  //         new BigNumber(15),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(1e7),
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       await pool.updatePosition(
  //         initialSt.new_position_id,
  //         new BigNumber(-1e7),
  //         alice.pkh,
  //         alice.pkh,
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       const poolStorage = (await pool.contract.storage()) as any;
  //       const xBalance = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         pool.contract.address,
  //       );
  //       const yBalance = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         pool.contract.address,
  //       );
  //       // The contract's balance should be 0.
  //       // There is a margin of error, so the contract may end up with at most 1 token.
  //       expect(xBalance.toNumber()).to.be.closeTo(0, 1);
  //       expect(yBalance.toNumber()).to.be.closeTo(0, 1);
  //       equal(
  //         poolStorage.new_position_id.toNumber(),
  //         initialSt.new_position_id.toNumber() + 1,
  //       );
  //     }
  //   });

  //   it.skip("Should allow Liquidity Providers earning fees from swaps", async () => {
  //     const fees = genFees(4);
  //     const swappers = [bobSigner, peterSigner];
  //     const {
  //       factory: _factory,
  //       fa12TokenX: _fa12TokenX,
  //       fa12TokenY: _fa12TokenY,
  //       fa2TokenX: _fa2TokenX,
  //       fa2TokenY: _fa2TokenY,
  //       poolFa12: _poolFa12,
  //       poolFa2: _poolFa2,
  //       poolFa1_2: _poolFa1_2,
  //       poolFa2_1: _poolFa2_1,
  //     } = await poolsFixture(
  //       tezos,
  //       [aliceSigner, bobSigner, peterSigner],
  //       fees,
  //     );
  //     factory = _factory;
  //     fa12TokenX = _fa12TokenX;
  //     fa12TokenY = _fa12TokenY;
  //     fa2TokenX = _fa2TokenX;
  //     fa2TokenY = _fa2TokenY;
  //     poolFa12 = _poolFa12;
  //     poolFa2 = _poolFa2;
  //     poolFa1_2 = _poolFa1_2;
  //     poolFa2_1 = _poolFa2_1;
  //     for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
  //       tezos.setSignerProvider(aliceSigner);
  //       const transferAmount = new BigNumber(Math.floor(Math.random() * 1e4));
  //       const initialSt = await pool.getRawStorage();
  //       const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
  //       const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];

  //       const prevEveBalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         eve.pkh,
  //       );
  //       const prevEveBalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         eve.pkh,
  //       );
  //       await pool.setPosition(
  //         new BigNumber(-10000),
  //         new BigNumber(10000),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(1e7),
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       let xFees: BigNumber = new BigNumber(0);
  //       let yFees: BigNumber = new BigNumber(0);
  //       for (const swapper of swappers) {
  //         const initialSt = await pool.getRawStorage();
  //         const feeBps = initialSt.constants.fee_bps;
  //         tezos.setSignerProvider(swapper);
  //         const swapperAddr = await swapper.publicKeyHash();
  //         await pool.swapXY(
  //           transferAmount,
  //           validDeadline(),
  //           new BigNumber(1),
  //           swapperAddr,
  //         );
  //         await pool.swapYX(
  //           transferAmount,
  //           validDeadline(),
  //           new BigNumber(1),
  //           swapperAddr,
  //         );

  //         const storage = await pool.getRawStorage();
  //         const xFee = calcSwapFee(feeBps, transferAmount);
  //         const yFee = calcSwapFee(feeBps, transferAmount);
  //         xFees = xFees.plus(xFee);
  //         yFees = yFees.plus(yFee);
  //       }
  //       tezos.setSignerProvider(aliceSigner);
  //       await collectFees(pool, eve.pkh, [initialSt.new_position_id]);
  //       const eveBalanceX = (
  //         await getTypedBalance(
  //           tezos,
  //           tokenTypeX,
  //           initialSt.constants.token_x,
  //           eve.pkh,
  //         )
  //       ).minus(prevEveBalanceX);
  //       const eveBalanceY = (
  //         await getTypedBalance(
  //           tezos,
  //           tokenTypeY,
  //           initialSt.constants.token_y,
  //           eve.pkh,
  //         )
  //       ).minus(prevEveBalanceY);
  //       ok(isInRangeNat(eveBalanceX, xFees, new Nat(1), new Nat(0)));
  //       ok(isInRangeNat(eveBalanceY, yFees, new Nat(1), new Nat(0)));
  //       /**  Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable. */
  //       expect(shiftRight(xFees, new BigNumber(128)).toNumber()).to.be.closeTo(
  //         0,
  //         1,
  //       );
  //       expect(shiftRight(yFees, new BigNumber(128)).toNumber()).to.be.closeTo(
  //         0,
  //         1,
  //       );
  //     }
  //   });
  //   it.skip("Should allow Liquidity Providers earning fees proportional to their liquidity", async () => {
  //     const fees = [
  //       Math.floor(Math.random() * 1e4),
  //       Math.floor(Math.random() * 1e4),
  //       Math.floor(Math.random() * 1e4),
  //       Math.floor(Math.random() * 1e4),
  //     ];
  //     const swappers = [bobSigner, peterSigner];
  //     const {
  //       factory: _factory,
  //       fa12TokenX: _fa12TokenX,
  //       fa12TokenY: _fa12TokenY,
  //       fa2TokenX: _fa2TokenX,
  //       fa2TokenY: _fa2TokenY,
  //       poolFa12: _poolFa12,
  //       poolFa2: _poolFa2,
  //       poolFa1_2: _poolFa1_2,
  //       poolFa2_1: _poolFa2_1,
  //     } = await poolsFixture(
  //       tezos,
  //       [aliceSigner, bobSigner, peterSigner, eveSigner],
  //       fees,
  //     );
  //     factory = _factory;
  //     fa12TokenX = _fa12TokenX;
  //     fa12TokenY = _fa12TokenY;
  //     fa2TokenX = _fa2TokenX;
  //     fa2TokenY = _fa2TokenY;
  //     poolFa12 = _poolFa12;
  //     poolFa2 = _poolFa2;
  //     poolFa1_2 = _poolFa1_2;
  //     poolFa2_1 = _poolFa2_1;
  //     for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
  //       const transferAmount = new BigNumber(Math.floor(Math.random() * 1e4));
  //       const initialSt = await pool.getRawStorage();
  //       const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
  //       const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
  //       tezos.setSignerProvider(eveSigner);
  //       await pool.setPosition(
  //         new BigNumber(-10000),
  //         new BigNumber(10000),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(1e7),
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       tezos.setSignerProvider(aliceSigner);
  //       await pool.setPosition(
  //         new BigNumber(-10000),
  //         new BigNumber(10000),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(1e7 * 3),
  //         validDeadline(),
  //         new BigNumber(1e7 * 3),
  //         new BigNumber(1e7 * 3),
  //       );
  //       const prevEveBalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         eve.pkh,
  //       );
  //       const prevEveBalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         eve.pkh,
  //       );
  //       const prevAliceBalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         alice.pkh,
  //       );
  //       const prevAliceBalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         alice.pkh,
  //       );
  //       let xFees: BigNumber = new BigNumber(0);
  //       let yFees: BigNumber = new BigNumber(0);
  //       for (const swapper of swappers) {
  //         const initialSt = await pool.getRawStorage();
  //         const feeBps = initialSt.constants.fee_bps;
  //         const prevXFeeBalance = initialSt.fee_growth.x;
  //         const prevYFeeBalance = initialSt.fee_growth.y;
  //         tezos.setSignerProvider(swapper);
  //         const swapperAddr = await swapper.publicKeyHash();
  //         await pool.swapXY(
  //           transferAmount,
  //           validDeadline(),
  //           new BigNumber(1),
  //           swapperAddr,
  //         );
  //         await pool.swapYX(
  //           transferAmount,
  //           validDeadline(),
  //           new BigNumber(1),
  //           swapperAddr,
  //         );
  //         const storage = await pool.getRawStorage();
  //         const xFeeBalance = storage.fee_growth.x;
  //         const yFeeBalance = storage.fee_growth.y;
  //         const xFee = calcSwapFee(feeBps, transferAmount);
  //         const yFee = calcSwapFee(feeBps, transferAmount);
  //         xFees = xFees.plus(xFee);
  //         yFees = yFees.plus(yFee);
  //       }
  //       const st = await pool.getRawStorage();
  //       const poolSt = await pool.getStorage();
  //       const upperTi = new Int(10000);
  //       const lowerTi = new Int(-10000);
  //       const st2 = await pool.getStorage(
  //         [(new Nat(0), new Nat(1))],
  //         [new Int(minTickIndex), new Int(maxTickIndex), lowerTi, upperTi],
  //         [new Nat(0), new Nat(1), new Nat(2), new Nat(3), new Nat(4)],
  //       );
  //       await checkAllInvariants(
  //         pool,
  //         { [alice.pkh]: aliceSigner, [eve.pkh]: eveSigner },
  //         [new Nat(0), new Nat(1), new Nat(2)],
  //         [new Int(minTickIndex), new Int(maxTickIndex), lowerTi, upperTi],
  //         genNatIds(50),
  //       );
  //       tezos.setSignerProvider(aliceSigner);
  //       await collectFees(pool, eve.pkh, [initialSt.new_position_id]);
  //       await collectFees(pool, alice.pkh, [initialSt.new_position_id.plus(1)]);
  //       const eveBalanceX = (
  //         await getTypedBalance(
  //           tezos,
  //           tokenTypeX,
  //           initialSt.constants.token_x,
  //           eve.pkh,
  //         )
  //       ).minus(prevEveBalanceX);
  //       const eveBalanceY = (
  //         await getTypedBalance(
  //           tezos,
  //           tokenTypeY,
  //           initialSt.constants.token_y,
  //           eve.pkh,
  //         )
  //       ).minus(prevEveBalanceY);
  //       const aliceBalanceX = (
  //         await getTypedBalance(
  //           tezos,
  //           tokenTypeX,
  //           initialSt.constants.token_x,
  //           alice.pkh,
  //         )
  //       ).minus(prevAliceBalanceX);
  //       const aliceBalanceY = (
  //         await getTypedBalance(
  //           tezos,
  //           tokenTypeY,
  //           initialSt.constants.token_y,
  //           alice.pkh,
  //         )
  //       ).minus(prevAliceBalanceY);
  //       /**
  //        *  -- Position 2 has triple the liquidity of Position 1,
  //           -- so `feeReceiver1` should get 1/4 of all earned fees and `feeReceiver2` should get 3/4.
  //           -- Note: Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable.
  //       */
  //       ok(
  //         isInRangeNat(
  //           eveBalanceX,
  //           xFees.dividedBy(4),
  //           new BigNumber(1),
  //           new BigNumber(0),
  //         ),
  //       );
  //       ok(
  //         isInRangeNat(
  //           eveBalanceY,
  //           yFees.dividedBy(4),
  //           new BigNumber(1),
  //           new BigNumber(0),
  //         ),
  //       );
  //       ok(
  //         isInRangeNat(
  //           aliceBalanceX,
  //           xFees.multipliedBy(3).dividedBy(4),
  //           new BigNumber(1),
  //           new BigNumber(0),
  //         ),
  //       );
  //       ok(
  //         isInRangeNat(
  //           aliceBalanceY,
  //           yFees.multipliedBy(3).dividedBy(4),
  //           new BigNumber(1),
  //           new BigNumber(0),
  //         ),
  //       );
  //     }
  //   });
  //   it.skip("Liquidity Providers do not receive past fees", async () => {
  //     const swapper = peterSigner;
  //     const feeReceiver1 = carol.pkh;
  //     const feeReceiver2 = sara.pkh;
  //     const {
  //       factory: _factory,
  //       fa12TokenX: _fa12TokenX,
  //       fa12TokenY: _fa12TokenY,
  //       fa2TokenX: _fa2TokenX,
  //       fa2TokenY: _fa2TokenY,
  //       poolFa12: _poolFa12,
  //       poolFa2: _poolFa2,
  //       poolFa1_2: _poolFa1_2,
  //       poolFa2_1: _poolFa2_1,
  //     } = await poolsFixture(
  //       tezos,
  //       [aliceSigner, bobSigner, peterSigner],
  //       genFees(4),
  //     );

  //     factory = _factory;
  //     fa12TokenX = _fa12TokenX;
  //     fa12TokenY = _fa12TokenY;
  //     fa2TokenX = _fa2TokenX;
  //     fa2TokenY = _fa2TokenY;
  //     poolFa12 = _poolFa12;
  //     poolFa2 = _poolFa2;
  //     poolFa1_2 = _poolFa1_2;
  //     poolFa2_1 = _poolFa2_1;
  //     for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
  //       const transferAmountB = new BigNumber(Math.floor(Math.random() * 1e4));
  //       const transferAmountA = new BigNumber(Math.floor(Math.random() * 1e4));
  //       const initialSt = await pool.getRawStorage();
  //       const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
  //       const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
  //       const feeBps = initialSt.constants.fee_bps;
  //       const prevXFeeBalance = initialSt.fee_growth.x;
  //       const prevYFeeBalance = initialSt.fee_growth.y;
  //       const prevfeeReceiver1BalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         feeReceiver1,
  //       );
  //       const prevfeeReceiver1BalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         feeReceiver1,
  //       );
  //       const prevfeeReceiver2BalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         feeReceiver2,
  //       );
  //       const prevfeeReceiver2BalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         feeReceiver2,
  //       );

  //       tezos.setSignerProvider(aliceSigner);
  //       await pool.setPosition(
  //         new BigNumber(-10000),
  //         new BigNumber(10000),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(1e7),
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );

  //       tezos.setSignerProvider(swapper);
  //       const swapperAddr = await swapper.publicKeyHash();
  //       await pool.swapXY(
  //         transferAmountB,
  //         validDeadline(),
  //         new BigNumber(1),
  //         swapperAddr,
  //       );
  //       await pool.swapYX(
  //         transferAmountB,
  //         validDeadline(),
  //         new BigNumber(1),
  //         swapperAddr,
  //       );

  //       const storage = await pool.getRawStorage();
  //       const xFeeBalance = storage.fee_growth.x;
  //       const yFeeBalance = storage.fee_growth.y;
  //       const prevXBefore = calcSwapFee(feeBps, transferAmountB);
  //       const prevYBefore = calcSwapFee(feeBps, transferAmountB);
  //       tezos.setSignerProvider(bobSigner);

  //       await pool.setPosition(
  //         new BigNumber(-10000),
  //         new BigNumber(10000),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(1e7),
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       tezos.setSignerProvider(swapper);

  //       await pool.swapXY(
  //         transferAmountA,
  //         validDeadline(),
  //         new BigNumber(1),
  //         swapperAddr,
  //       );
  //       await pool.swapYX(
  //         transferAmountA,
  //         validDeadline(),
  //         new BigNumber(1),
  //         swapperAddr,
  //       );

  //       const storage2 = await pool.getRawStorage();
  //       const xFeeBalance2 = storage2.fee_growth.x;
  //       const yFeeBalance2 = storage2.fee_growth.y;
  //       const prevXAfter = calcSwapFee(feeBps, transferAmountA);
  //       const prevYAfter = calcSwapFee(feeBps, transferAmountA);
  //       await checkAllInvariants(
  //         pool,
  //         [],
  //         genNatIds(2),
  //         [
  //           new Int(minTickIndex),
  //           new Int(maxTickIndex),
  //           new Int(-10000),
  //           new Int(10000),
  //         ],
  //         genNatIds(50),
  //       );
  //       tezos.setSignerProvider(aliceSigner);
  //       await collectFees(pool, feeReceiver1, [new BigNumber(0)]);
  //       tezos.setSignerProvider(bobSigner);
  //       await collectFees(pool, feeReceiver2, [new BigNumber(1)]);
  //       const st = await pool.getRawStorage();
  //       const feeReceiver1BalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         feeReceiver1,
  //       );
  //       const feeReceiver1BalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         feeReceiver1,
  //       );
  //       const feeReceiver2BalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         feeReceiver2,
  //       );
  //       const feeReceiver2BalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         feeReceiver2,
  //       );

  //       ok(
  //         isInRangeNat(
  //           feeReceiver1BalanceX.minus(prevfeeReceiver1BalanceX),
  //           prevXBefore.plus(prevXAfter.div(2)),
  //           new BigNumber(1),
  //           new BigNumber(0),
  //         ),
  //       );
  //       ok(
  //         isInRangeNat(
  //           feeReceiver1BalanceY.minus(prevfeeReceiver1BalanceY),
  //           prevYBefore.plus(prevYAfter.div(2)),
  //           new BigNumber(1),
  //           new BigNumber(0),
  //         ),
  //       );
  //       ok(
  //         isInRangeNat(
  //           feeReceiver2BalanceX.minus(prevfeeReceiver2BalanceX),
  //           prevXAfter.div(2),
  //           new BigNumber(1),
  //           new BigNumber(0),
  //         ),
  //       );
  //       ok(
  //         isInRangeNat(
  //           feeReceiver2BalanceY.minus(prevfeeReceiver2BalanceY),
  //           prevYAfter.div(2),
  //           new BigNumber(1),
  //           new BigNumber(0),
  //         ),
  //       );
  //       await checkAllInvariants(
  //         pool,
  //         [],
  //         genNatIds(2),
  //         [
  //           new Int(minTickIndex),
  //           new Int(maxTickIndex),
  //           new Int(-10000),
  //           new Int(10000),
  //         ],
  //         genNatIds(50),
  //       );
  //       // (xFeesBefore, yFeesBefore) <- placeSwaps beforeSwaps from Haskel to TS
  //     }
  //   });
  //   it.skip("Should allow accrued fees are discounted when adding liquidity to an existing position", async () => {
  //     const lowerTickIndex = -10000;
  //     const upperTickIndex = 10000;
  //     const swappers = [bobSigner, peterSigner];
  //     const feeReceiver = sara.pkh;
  //     //const cerychSigner = new InMemorySigner(accounts.peter.sk);
  //     const {
  //       factory: _factory,
  //       fa12TokenX: _fa12TokenX,
  //       fa12TokenY: _fa12TokenY,
  //       fa2TokenX: _fa2TokenX,
  //       fa2TokenY: _fa2TokenY,
  //       poolFa12: _poolFa12,
  //       poolFa2: _poolFa2,
  //       poolFa1_2: _poolFa1_2,
  //       poolFa2_1: _poolFa2_1,
  //     } = await poolsFixture(
  //       tezos,
  //       [aliceSigner, peterSigner, bobSigner],
  //       genFees(4, false),
  //     );

  //     factory = _factory;
  //     fa12TokenX = _fa12TokenX;
  //     fa12TokenY = _fa12TokenY;
  //     fa2TokenX = _fa2TokenX;
  //     fa2TokenY = _fa2TokenY;
  //     poolFa12 = _poolFa12;
  //     poolFa2 = _poolFa2;
  //     poolFa1_2 = _poolFa1_2;
  //     poolFa2_1 = _poolFa2_1;
  //     for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
  //       const transferAmount = new BigNumber(Math.floor(Math.random() * 1e4));
  //       const initialSt = await pool.getRawStorage();
  //       const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
  //       const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
  //       tezos.setSignerProvider(aliceSigner);
  //       await pool.setPosition(
  //         new BigNumber(lowerTickIndex),
  //         new BigNumber(upperTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(1e7),
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       let xFees: BigNumber = new BigNumber(0);
  //       let yFees: BigNumber = new BigNumber(0);
  //       for (const swapper of swappers) {
  //         const initialSt = await pool.getRawStorage();
  //         const feeBps = initialSt.constants.fee_bps;
  //         tezos.setSignerProvider(swapper);
  //         const swapperAddr = await swapper.publicKeyHash();
  //         await pool.swapXY(
  //           transferAmount,
  //           validDeadline(),
  //           new BigNumber(1),
  //           swapperAddr,
  //         );
  //         await pool.swapYX(
  //           transferAmount,
  //           validDeadline(),
  //           new BigNumber(1),
  //           swapperAddr,
  //         );
  //         const storage = await pool.getRawStorage();
  //         const xFee = calcSwapFee(feeBps, transferAmount);
  //         const yFee = calcSwapFee(feeBps, transferAmount);
  //         xFees = xFees.plus(xFee);
  //         yFees = yFees.plus(yFee);
  //       }
  //       tezos.setSignerProvider(aliceSigner);
  //       const aliceBalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         alice.pkh,
  //       );
  //       const aliceBalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         alice.pkh,
  //       );
  //       await pool.updatePosition(
  //         new BigNumber(0),
  //         new BigNumber(1e7),
  //         feeReceiver,
  //         feeReceiver,
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       const storage = await pool.getRawStorage();
  //       const finalAliceBalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         alice.pkh,
  //       );
  //       const finalAliceBalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         alice.pkh,
  //       );
  //       const feeReceiverBalanceX = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         feeReceiver,
  //       );
  //       const feeReceiverBalanceY = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         feeReceiver,
  //       );
  //       //let PerToken xDelta yDelta = liquidityDeltaToTokensDelta (fromIntegral liquidityDelta) lowerTickIndex upperTickIndex (sCurTickIndexRPC st) (sSqrtPriceRPC st)
  //       const liquidityDelta = liquidityDeltaToTokensDelta(
  //         new Int(1e7),
  //         new Int(lowerTickIndex),
  //         new Int(upperTickIndex),
  //         new Int(storage.cur_tick_index),
  //         new Nat(storage.sqrt_price),
  //       );
  //       const xDelta = liquidityDelta.x;
  //       const yDelta = liquidityDelta.y;
  //       /**
  //        * Note: Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable.
  //        * Due to the floating-point math used in `liquidityDeltaToTokensDelta`, it's possible there
  //        * will be an additional +/- 1 error.
  //        */
  //       ok(
  //         isInRangeNat(
  //           finalAliceBalanceX,
  //           aliceBalanceX.plus(xFees).minus(xDelta),
  //           new BigNumber(2),
  //           new BigNumber(1),
  //         ),
  //       );
  //       ok(
  //         isInRangeNat(
  //           finalAliceBalanceY,
  //           aliceBalanceY.plus(yFees).minus(yDelta),
  //           new BigNumber(2),
  //           new BigNumber(1),
  //         ),
  //       );
  //       /**
  //        * `feeReceiver` should not receive any fees.
  //        */
  //       strictEqual(feeReceiverBalanceX.toFixed(), "0");
  //       strictEqual(feeReceiverBalanceY.toFixed(), "0");
  //     }
  //   });
  //   it.skip("Should Liquidating a position in small steps is (mostly) equivalent to doing it all at once", async () => {
  //     const lowerTickIndex = -10000;
  //     const upperTickIndex = 10000;
  //     const liquidityDelta = new BigNumber(1e7);
  //     const swapper = bobSigner;
  //     const liquidityProvider1 = aliceSigner;
  //     const liquidityProvider2 = eveSigner;
  //     const receiver1 = sara.pkh;
  //     const receiver2 = dave.pkh;
  //     const {
  //       factory: _factory,
  //       fa12TokenX: _fa12TokenX,
  //       fa12TokenY: _fa12TokenY,
  //       fa2TokenX: _fa2TokenX,
  //       fa2TokenY: _fa2TokenY,
  //       poolFa12: _poolFa12,
  //       poolFa2: _poolFa2,
  //       poolFa1_2: _poolFa1_2,
  //       poolFa2_1: _poolFa2_1,
  //     } = await poolsFixture(
  //       tezos,
  //       [aliceSigner, eveSigner, bobSigner],
  //       [50_00, 50_00, 50_00, 50_00],
  //     );
  //     factory = _factory;
  //     fa12TokenX = _fa12TokenX;
  //     fa12TokenY = _fa12TokenY;
  //     fa2TokenX = _fa2TokenX;
  //     fa2TokenY = _fa2TokenY;
  //     poolFa12 = _poolFa12;
  //     poolFa2 = _poolFa2;
  //     poolFa1_2 = _poolFa1_2;
  //     poolFa2_1 = _poolFa2_1;
  //     const swapData = [
  //       { swapDirection: "XToY", swapAmt: new BigNumber(1000) },
  //       { swapDirection: "YToX", swapAmt: new BigNumber(3000) },
  //       { swapDirection: "XToY", swapAmt: new BigNumber(400) },
  //     ];
  //     for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
  //       const initialSt = await pool.getRawStorage();
  //       const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
  //       const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
  //       tezos.setSignerProvider(liquidityProvider1);
  //       await pool.setPosition(
  //         new BigNumber(lowerTickIndex),
  //         new BigNumber(upperTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(1e7),
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       tezos.setSignerProvider(liquidityProvider2);
  //       await pool.setPosition(
  //         new BigNumber(lowerTickIndex),
  //         new BigNumber(upperTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(1e7),
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       tezos.setSignerProvider(bobSigner);
  //       const swapperAddr = await swapper.publicKeyHash();
  //       const newCallSettings: CallSettings = {
  //         swapXY: CallMode.returnParams,
  //         swapYX: CallMode.returnParams,
  //         setPosition: CallMode.returnParams,
  //         updatePosition: CallMode.returnConfirmatedOperation,
  //         transfer: CallMode.returnParams,
  //         updateOperators: CallMode.returnParams,
  //         increaseObservationCount: CallMode.returnConfirmatedOperation,
  //       };
  //       pool.setCallSetting(newCallSettings);
  //       let transferParams: any = [];
  //       for (const { swapDirection, swapAmt } of swapData) {
  //         switch (swapDirection) {
  //           case "XToY":
  //             transferParams.push(
  //               await pool.swapXY(
  //                 swapAmt,
  //                 validDeadline(),
  //                 new BigNumber(1),
  //                 swapperAddr,
  //               ),
  //             );
  //             break;
  //           default:
  //             transferParams.push(
  //               await pool.swapYX(
  //                 swapAmt,
  //                 validDeadline(),
  //                 new BigNumber(1),
  //                 swapperAddr,
  //               ),
  //             );
  //         }
  //       }

  //       const swapOps = await sendBatch(tezos, transferParams);
  //       await confirmOperation(tezos, swapOps.opHash);
  //       // -- Liquidate the position all at once
  //       //withSender liquidityProvider1 $ updatePosition cfmm receiver1 (- toInteger liquidityDelta) 0
  //       tezos.setSignerProvider(liquidityProvider1);
  //       await pool.updatePosition(
  //         new BigNumber(0),
  //         new BigNumber(-liquidityDelta),
  //         receiver1,
  //         receiver1,
  //         validDeadline(),
  //         new BigNumber(1e7),
  //         new BigNumber(1e7),
  //       );
  //       // -- Liquidate the position in small steps
  //       //  -- Doing all 10 calls in one batch may go over the gas limit,
  //       //  -- so we do it in 2 batches of 5 instead.
  //       newCallSettings.updatePosition = CallMode.returnParams;
  //       pool.setCallSetting(newCallSettings);
  //       tezos.setSignerProvider(liquidityProvider2);
  //       const updatePositionParams: any = [];
  //       for (let i = 0; i < 2; i++) {
  //         for (let j = 0; j < 5; j++) {
  //           updatePositionParams.push(
  //             await pool.updatePosition(
  //               new BigNumber(1),
  //               new BigNumber(-liquidityDelta.div(10)),
  //               receiver2,
  //               receiver2,
  //               validDeadline(),
  //               new BigNumber(1e7),
  //               new BigNumber(1e7),
  //             ),
  //           );
  //         }
  //       }
  //       const updatePositionOps = await sendBatch(tezos, updatePositionParams);
  //       await confirmOperation(tezos, updatePositionOps.opHash);
  //       // -- Check that the balances are the same
  //       const balanceReceiver1X = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         receiver1,
  //       );
  //       const balanceReceiver1Y = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         receiver1,
  //       );
  //       const balanceReceiver2X = await getTypedBalance(
  //         tezos,
  //         tokenTypeX,
  //         initialSt.constants.token_x,
  //         receiver2,
  //       );
  //       const balanceReceiver2Y = await getTypedBalance(
  //         tezos,
  //         tokenTypeY,
  //         initialSt.constants.token_y,
  //         receiver2,
  //       );
  //       // -- Liquidating in 10 smaller steps may lead
  //       // -- to `receiver2` receiving up to 10 fewer tokens due to rounding errors.
  //       ok(
  //         isInRangeNat(
  //           balanceReceiver2X,
  //           balanceReceiver1X,
  //           new BigNumber(10),
  //           new BigNumber(0),
  //         ),
  //       );
  //       ok(
  //         isInRangeNat(
  //           balanceReceiver2Y,
  //           balanceReceiver1Y,
  //           new BigNumber(10),
  //           new BigNumber(0),
  //         ),
  //       );
  //     }
  //   });
  //   it.skip("Should Ticks' states are updating correctly when an overlapping position is created", async () => {
  //     const liquidityProvider = aliceSigner;
  //     tezos.setSignerProvider(liquidityProvider);
  //     const swapper = bobSigner;

  //     let liquidityDelta = 1e5;

  //     let ti1 = new Int(0);
  //     let ti2 = new Int(50);
  //     let ti3 = new Int(100);
  //     let ti4 = new Int(150);
  //     const {
  //       factory,
  //       fa12TokenX,
  //       fa12TokenY,
  //       fa2TokenX,
  //       fa2TokenY,
  //       poolFa12,
  //       poolFa2,
  //       poolFa1_2,
  //       poolFa2_1,
  //     } = await poolsFixture(tezos, [aliceSigner, bobSigner], genFees(4));

  //     for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
  //       tezos.setSignerProvider(liquidityProvider);
  //       pool.callSettings.setPosition = CallMode.returnParams;
  //       const setPositionParams = [
  //         await pool.setPosition(
  //           ti1,
  //           ti3,
  //           new BigNumber(minTickIndex),
  //           new BigNumber(minTickIndex),
  //           new BigNumber(liquidityDelta),
  //           validDeadline(),
  //           new BigNumber(liquidityDelta),
  //           new BigNumber(liquidityDelta),
  //         ),
  //         await pool.setPosition(
  //           ti2,
  //           ti4,
  //           new BigNumber(minTickIndex),
  //           new BigNumber(minTickIndex),
  //           new BigNumber(liquidityDelta),
  //           validDeadline(),
  //           new BigNumber(liquidityDelta),
  //           new BigNumber(liquidityDelta),
  //         ),
  //       ];

  //       const setPositionOps = await sendBatch(
  //         tezos,
  //         setPositionParams as TransferParams[],
  //       );
  //       await confirmOperation(tezos, setPositionOps.opHash);

  //       //  -- Place a small swap to move the tick a little bit
  //       // -- and make sure `tick_cumulative` is not 0.
  //       tezos.setSignerProvider(swapper);

  //       await pool.swapYX(
  //         new BigNumber(100),
  //         validDeadline(),
  //         new BigNumber(0),
  //         await swapper.publicKeyHash(),
  //       );
  //       // -- Advance the time a few secs to make sure accumulators
  //       // -- like `seconds_per_liquidity_cumulative` change to non-zero values.
  //       await advanceSecs(2, [pool]);
  //       // -- Place a swap big enough to cross tick `ti2` and therefore
  //       // -- change the value of the `*_outside` fields to something other than zero.
  //       await pool.swapYX(
  //         new BigNumber(1_000),
  //         validDeadline(),
  //         new BigNumber(0),
  //         await swapper.publicKeyHash(),
  //       );
  //       const initialStorage = await pool.getStorage(
  //         genNatIds(2),
  //         [ti1, ti2, ti3, ti4, new Int(minTickIndex), new Int(maxTickIndex)],
  //         genNatIds(50),
  //       );
  //       const initialState = initialStorage.ticks.get(ti2);

  //       // -- Place a new position on `ti2` in order to update its state.
  //       tezos.setSignerProvider(liquidityProvider);
  //       pool.callSettings.setPosition = CallMode.returnConfirmatedOperation;
  //       await pool.setPosition(
  //         new BigNumber(ti2),
  //         new BigNumber(ti3),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(minTickIndex),
  //         new BigNumber(liquidityDelta),
  //         validDeadline(),
  //         new BigNumber(liquidityDelta),
  //         new BigNumber(liquidityDelta),
  //       );

  //       // -- Check that `ti2`'s state has been updated.
  //       const finalStorage = await pool.getStorage(
  //         genNatIds(3),
  //         [ti1, ti2, ti3, ti4, new Int(minTickIndex), new Int(maxTickIndex)],
  //         genNatIds(50),
  //       );
  //       const finalState = finalStorage.ticks.get(ti2);

  //       expect(finalState.nPositions).to.deep.equal(
  //         initialState.nPositions.plus(1),
  //       );
  //       expect(finalState.liquidityNet).to.deep.equal(
  //         initialState.liquidityNet.plus(liquidityDelta),
  //       );
  //       expect(finalState.sqrtPrice).to.deep.equal(initialState.sqrtPrice);

  //       // -- Accumulators should stay unchanged.
  //       expect(finalState.feeGrowthOutside).to.deep.equal(
  //         initialState.feeGrowthOutside,
  //       );
  //       expect(finalState.secondsOutside).to.deep.equal(
  //         initialState.secondsOutside,
  //       );
  //       expect(finalState.secondsPerLiquidityOutside).to.deep.equal(
  //         initialState.secondsPerLiquidityOutside,
  //       );
  //       expect(finalState.tickCumulativeOutside).to.deep.equal(
  //         initialState.tickCumulativeOutside,
  //       );
  //     }
  //   });
  //   it.skip("Should initializing correctly position", async () => {
  //     const liquidityProvider = aliceSigner;
  //     tezos.setSignerProvider(liquidityProvider);
  //     const swapper = bobSigner;
  //     const createPositionData = await genNonOverlappingPositions();

  //     const swapDirections = Array.from(
  //       { length: createPositionData.length },
  //       () => genSwapDirection(),
  //     );
  //     const {
  //       factory,
  //       fa12TokenX,
  //       fa12TokenY,
  //       fa2TokenX,
  //       fa2TokenY,
  //       poolFa12,
  //       poolFa2,
  //       poolFa1_2,
  //       poolFa2_1,
  //     } = await poolsFixture(tezos, [aliceSigner, bobSigner], genFees(4));

  //     for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
  //       await pool.increaseObservationCount(new BigNumber(1));

  //       const inSt = await pool.getRawStorage();
  //       const tokenTypeX = Object.keys(inSt.constants.token_x)[0];
  //       const tokenTypeY = Object.keys(inSt.constants.token_y)[0];
  //       const knownedTicks: Int[] = [
  //         new Int(minTickIndex),
  //         new Int(maxTickIndex),
  //       ];
  //       for (const [cpd, swapDirection] of createPositionData.map((cpd, i) => [
  //         cpd,
  //         swapDirections[i] === 0 ? "XtoY" : "YtoX",
  //       ])) {
  //         const lowerTickIndex = new Int(cpd.lowerTickIndex);
  //         const upperTickIndex = new Int(cpd.upperTickIndex);
  //         const liquidityDelta = cpd.liquidityDelta;
  //         const waitTime = cpd.cpdWaitTime;
  //         tezos.setSignerProvider(liquidityProvider);

  //         // -- Perform a swap to move the tick a bit.
  //         // -- This ensures the global accumulators (like fee_growth) aren't always 0.
  //         let initialBalanceX = await getTypedBalance(
  //           tezos,
  //           tokenTypeX,
  //           inSt.constants.token_x,
  //           pool.contract.address,
  //         );
  //         let initialBalanceY = await getTypedBalance(
  //           tezos,
  //           tokenTypeY,
  //           inSt.constants.token_y,
  //           pool.contract.address,
  //         );

  //         tezos.setSignerProvider(swapper);
  //         switch (swapDirection) {
  //           case "XtoY":
  //             const amt = initialBalanceX
  //               .div(2)
  //               .integerValue(BigNumber.ROUND_FLOOR);
  //             await safeSwap(
  //               amt,
  //               new BigNumber(0),
  //               validDeadline(),
  //               await swapper.publicKeyHash(),
  //               pool.swapXY,
  //             );
  //             break;
  //           default:
  //             const amt2 = initialBalanceY
  //               .div(2)
  //               .integerValue(BigNumber.ROUND_FLOOR);
  //             await safeSwap(
  //               amt2,
  //               new BigNumber(0),
  //               validDeadline(),
  //               await swapper.publicKeyHash(),
  //               pool.swapYX,
  //             );
  //         }
  //         knownedTicks.push(upperTickIndex);
  //         knownedTicks.push(lowerTickIndex);

  //         // -- Advance the time a few secs to make sure the buffer is updated to reflect the swaps.
  //         await advanceSecs(waitTime, [pool]);
  //         checkAllInvariants(
  //           pool,
  //           [liquidityProvider, swapper],
  //           genNatIds(50),
  //           knownedTicks,
  //           genNatIds(200),
  //         );

  //         const initSt = await pool.getStorage(
  //           genNatIds(50),
  //           knownedTicks,
  //           genNatIds(200),
  //         );
  //         initialBalanceX = await getTypedBalance(
  //           tezos,
  //           tokenTypeX,
  //           inSt.constants.token_x,
  //           pool.contract.address,
  //         );
  //         initialBalanceY = await getTypedBalance(
  //           tezos,
  //           tokenTypeY,
  //           inSt.constants.token_y,
  //           pool.contract.address,
  //         );

  //         tezos.setSignerProvider(liquidityProvider);
  //         await pool.setPosition(
  //           lowerTickIndex,
  //           upperTickIndex,
  //           new BigNumber(minTickIndex),
  //           new BigNumber(minTickIndex),
  //           new BigNumber(liquidityDelta),
  //           validDeadline(),
  //           new BigNumber(liquidityDelta),
  //           new BigNumber(liquidityDelta),
  //         );

  //         const finalSt = await pool.getStorage(
  //           genNatIds(50),
  //           knownedTicks,
  //           genNatIds(200),
  //         );
  //         const {
  //           seconds: expectedSecondsOutside,
  //           tickCumulative: expectedTickCumulativeOutside,
  //           feeGrowth: expectedFeeGrowthOutside,
  //           secondsPerLiquidity: expectedSecondsPerLiquidityOutside,
  //         } = await initTickAccumulators(pool, finalSt, lowerTickIndex);
  //         // -- Ticks were initialized
  //         const initializedTickIndices = Object.keys(finalSt.ticks.map);
  //         expect(initializedTickIndices).to.include(lowerTickIndex.toString());
  //         expect(initializedTickIndices).to.include(upperTickIndex.toString());

  //         //  -- Ticks' states were correctly initialized.
  //         const lowerTick = finalSt.ticks.get(lowerTickIndex);
  //         const upperTick = finalSt.ticks.get(upperTickIndex);

  //         // -- `sqrtPriceFor` uses floating point math in Haskell, so we lose a lot of precision.
  //         // -- Therefore, we must accept a +/-1 margin of error.
  //         const lowerTickSqrtPrice = lowerTick.sqrtPrice;

  //         const lowerTickSqrtPriceForMinusOne = sqrtPriceForTick(
  //           lowerTickIndex.minus(1),
  //         );
  //         const lowerTickSqrtPriceForPlusOne = sqrtPriceForTick(
  //           lowerTickIndex.plus(1),
  //         );
  //         const lowerTickSqrtPrice_30 = adjustScale(
  //           lowerTickSqrtPrice,
  //           new Nat(80),
  //           new Nat(30),
  //         );
  //         ok(
  //           inRange(
  //             lowerTickSqrtPrice_30,
  //             adjustScale(
  //               lowerTickSqrtPriceForMinusOne,
  //               new Nat(80),
  //               new Nat(30),
  //             ),
  //             adjustScale(
  //               lowerTickSqrtPriceForPlusOne,
  //               new Nat(80),
  //               new Nat(30),
  //             ),
  //           ),
  //         );

  //         const upperTickSqrtPrice = upperTick.sqrtPrice;
  //         const upperTickSqrtPriceForMinusOne = sqrtPriceForTick(
  //           upperTickIndex.minus(1),
  //         );
  //         const upperTickSqrtPriceForPlusOne = sqrtPriceForTick(
  //           upperTickIndex.plus(1),
  //         );
  //         const upperTickSqrtPrice_30 = adjustScale(
  //           upperTickSqrtPrice,
  //           new Nat(80),
  //           new Nat(30),
  //         );
  //         ok(
  //           inRange(
  //             upperTickSqrtPrice_30,
  //             adjustScale(
  //               upperTickSqrtPriceForMinusOne,
  //               new Nat(80),
  //               new Nat(30),
  //             ),
  //             adjustScale(
  //               upperTickSqrtPriceForPlusOne,
  //               new Nat(80),
  //               new Nat(30),
  //             ),
  //           ),
  //         );

  //         expect(lowerTick.liquidityNet.toNumber()).to.be.eq(liquidityDelta);
  //         expect(upperTick.liquidityNet.toNumber()).to.be.eq(-liquidityDelta);

  //         expect(lowerTick.nPositions.toNumber()).to.be.eq(1);
  //         expect(upperTick.nPositions.toNumber()).to.be.eq(1);

  //         expect(lowerTick.secondsOutside).to.be.deep.equal(
  //           expectedSecondsOutside,
  //         );
  //         expect(lowerTick.tickCumulativeOutside).to.be.deep.eq(
  //           expectedTickCumulativeOutside,
  //         );
  //         expect(lowerTick.feeGrowthOutside).to.be.deep.eq(
  //           expectedFeeGrowthOutside,
  //         );
  //         expect(lowerTick.secondsPerLiquidityOutside).to.be.deep.eq(
  //           expectedSecondsPerLiquidityOutside,
  //         );
  //         const {
  //           seconds: expectedSecondsOutside2,
  //           tickCumulative: expectedTickCumulativeOutside2,
  //           feeGrowth: expectedFeeGrowthOutside2,
  //           secondsPerLiquidity: expectedSecondsPerLiquidityOutside2,
  //         } = await initTickAccumulators(pool, finalSt, upperTickIndex);

  //         expect(upperTick.secondsOutside).to.be.deep.eq(
  //           expectedSecondsOutside2,
  //         );

  //         expect(upperTick.tickCumulativeOutside).to.be.deep.eq(
  //           expectedTickCumulativeOutside2,
  //         );
  //         expect(upperTick.feeGrowthOutside).to.be.deep.eq(
  //           expectedFeeGrowthOutside2,
  //         );
  //         expect(upperTick.secondsPerLiquidityOutside).to.be.deep.eq(
  //           expectedSecondsPerLiquidityOutside2,
  //         );

  //         //  -- Check global state updates
  //         const positionIsActive =
  //           lowerTickIndex.lte(finalSt.curTickIndex) &&
  //           finalSt.curTickIndex.lt(upperTickIndex);

  //         if (positionIsActive) {
  //           expect(finalSt.liquidity).to.be.deep.eq(
  //             initSt.liquidity.plus(liquidityDelta),
  //           );
  //         } else {
  //           expect(finalSt.liquidity).to.be.deep.eq(initSt.liquidity);
  //         }

  //         const positionId = initSt.newPositionId;
  //         expect(finalSt.newPositionId).to.be.deep.eq(positionId.plus(1));

  //         //  -- Check position's state
  //         const position = finalSt.positions.get(new Nat(positionId));
  //         expect(position.liquidity.toNumber()).to.be.eq(liquidityDelta);
  //         expect(position.owner).to.be.eq(
  //           await liquidityProvider.publicKeyHash(),
  //         );

  //         expect(position.lowerTickIndex).to.be.deep.eq(lowerTickIndex);
  //         expect(position.upperTickIndex).to.be.deep.eq(upperTickIndex);

  //         const expectedFeeGrowthInside = await tickAccumulatorsInside(
  //           pool,
  //           finalSt,
  //           lowerTickIndex,
  //           upperTickIndex,
  //         ).then(a => a.aFeeGrowth);

  //         expect(
  //           position.feeGrowthInsideLast.x
  //             .plus(position.feeGrowthInsideLast.y)
  //             .toBignumber(),
  //         ).to.be.deep.eq(expectedFeeGrowthInside);

  //         //  -- Check FA2 transfers
  //         const xDelta = liquidityDeltaToTokensDelta(
  //           new Nat(liquidityDelta),
  //           lowerTickIndex,
  //           upperTickIndex,
  //           finalSt.curTickIndex,
  //           finalSt.sqrtPrice,
  //         ).x;

  //         const yDelta = liquidityDeltaToTokensDelta(
  //           new Nat(liquidityDelta),
  //           lowerTickIndex,
  //           upperTickIndex,
  //           finalSt.curTickIndex,
  //           finalSt.sqrtPrice,
  //         ).y;

  //         const finalBalanceX = await getTypedBalance(
  //           tezos,
  //           tokenTypeX,
  //           finalSt.constants.tokenX,
  //           pool.contract.address,
  //         );
  //         const finalBalanceY = await getTypedBalance(
  //           tezos,
  //           tokenTypeY,
  //           finalSt.constants.tokenY,
  //           pool.contract.address,
  //         );
  //         /* Checking if the final balance is negative, and if it is, it is negating it. */

  //         const exptectedFinalBalanceX = initialBalanceX.plus(xDelta);

  //         const exptectedFinalBalanceY = initialBalanceY.plus(yDelta);
  //         ok(
  //           isInRangeNat(
  //             finalBalanceX,
  //             exptectedFinalBalanceX,
  //             new BigNumber(0),
  //             new BigNumber(1),
  //           ),
  //         );
  //         ok(
  //           isInRangeNat(
  //             finalBalanceY,
  //             exptectedFinalBalanceY,
  //             new BigNumber(0),
  //             new BigNumber(1),
  //           ),
  //         );
  //       }
  //     }
  //   });
  // });
});