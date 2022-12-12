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
});
