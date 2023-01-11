import { equal, notEqual, ok, rejects } from "assert";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";

import { MichelsonMap, TezosToolkit, TransferParams } from "@taquito/taquito";
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
  initTimedCumulativesBuffer,
  Timestamp,
  entries,
} from "@madfish/quipuswap-v3/dist/utils";
import {
  adjustScale,
  calcSwapFee,
  calcNewPriceX,
  calcReceivedY,
  shiftLeft,
} from "@madfish/quipuswap-v3/dist/helpers/math";

import {
  checkAllInvariants,
  checkCumulativesBufferInvariants,
  checkCumulativesBufferTimeInvariants,
} from "./helpers/invariants";
import { Int, Nat, quipuswapV3Types } from "@madfish/quipuswap-v3/dist/types";
import {
  advanceSecs,
  collectFees,
  compareStorages,
  evalSecondsPerLiquidityX128,
  genFees,
  genNatIds,
  getCumulativesInsideDiff,
  getTypedBalance,
  groupAdjacent,
  moreBatchSwaps,
  sleep,
  validDeadline,
} from "./helpers/utils";
import { OperationEntry } from "@taquito/rpc";
import { BatchWalletOperation } from "@taquito/taquito/dist/types/wallet/batch-operation";

const alice = accounts.alice;
const bob = accounts.bob;
const peter = accounts.peter;
const eve = accounts.eve;
const sara = accounts.sara;
const carol = accounts.carol;
const aliceSigner = new InMemorySigner(alice.sk);
const bobSigner = new InMemorySigner(bob.sk);
const eveSigner = new InMemorySigner(eve.sk);

const minTickIndex = new Int(-1048575);
const maxTickIndex = new Int(1048575);

describe("Range oracles tests", async function () {
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
    it("Asking at uninitialized tick causes an error", async () => {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1, consumer } =
        await poolsFixture(tezos, [aliceSigner, bobSigner]);

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await pool.setPosition(
          new Int(-100),
          new Int(100),
          minTickIndex,
          minTickIndex,
          new Nat(1),
          validDeadline(),
          new Nat(1),
          new Nat(1),
        );
        await rejects(
          pool.contract.methodsObject
            .snapshot_cumulatives_inside({
              lower_tick_index: "-10",
              upper_tick_index: "100",
              callback: consumer.address,
            })
            .send(),
          (err: Error) => {
            equal(err.message.includes("105"), true);
            return true;
          },
        );
      }
    });
    it("Asking at empty range returns zeros", async () => {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1, consumer } =
        await poolsFixture(tezos, [aliceSigner, bobSigner]);

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await pool.setPosition(
          new Int(0),
          new Int(10),
          minTickIndex,
          minTickIndex,
          new Nat(100000),
          validDeadline(),
          new Nat(100000),
          new Nat(100000),
        );
        await sleep(1000);
        const op = await pool.contract.methodsObject
          .snapshot_cumulatives_inside({
            lower_tick_index: "0",
            upper_tick_index: "0",
            callback: consumer.address,
          })
          .send();
        await confirmOperation(tezos, op.hash);

        const st = await consumer.storage();

        const lastSnapshot = await st.snapshots.get(
          (st.snapshot_id.toNumber() - 1).toString(),
        );

        equal(lastSnapshot.seconds_inside.toFixed(), "0");
        equal(lastSnapshot.seconds_per_liquidity_inside.toFixed(), "0");
        equal(lastSnapshot.seconds_inside.toFixed(), "0");
      }
    });
    it("Asking at reversed range causes an error", async () => {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1, consumer } =
        await poolsFixture(tezos, [aliceSigner, bobSigner]);

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await pool.setPosition(
          new Int(0),
          new Int(10),
          minTickIndex,
          minTickIndex,
          new Nat(1),
          validDeadline(),
          new Nat(1),
          new Nat(1),
        );
        await rejects(
          pool.contract.methodsObject
            .snapshot_cumulatives_inside({
              lower_tick_index: "10",
              upper_tick_index: "0",
              callback: consumer.address,
            })
            .send(),
          (err: Error) => {
            equal(err.message.includes("110"), true);
            return true;
          },
        );
      }
    });
  });
  describe("Success cases", async () => {
    it("One position, jumping right", async () => {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1, consumer } =
        await poolsFixture(tezos, [aliceSigner, bobSigner]);
      const lowerTick = new Int(-100);
      const upperTick = new Int(100);

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await pool.setPosition(
          lowerTick,
          upperTick,
          minTickIndex,
          minTickIndex,
          new Nat(1000),
          validDeadline(),
          new Nat(1000),
          new Nat(1000),
        );
        const cumulativeDiff = await getCumulativesInsideDiff(
          pool,
          lowerTick,
          upperTick,
          consumer,
          5000,
        );
        const st = await pool.getStorage();
        const nextTC = await st.cumulativesBuffer.map.getActual(
          st.cumulativesBuffer.last,
        );
        const expectedSPL = evalSecondsPerLiquidityX128(
          nextTC.spl.blockStartLiquidityValue,
          new BigNumber(6),
        );

        expect(cumulativeDiff.tickCumulativeInside.toNumber()).to.equal(0);
        expect(cumulativeDiff.secondsInside.toNumber()).to.equal(6); //6 because we advance time by 5000ms and we have 1000ms in block operation
        expect(
          adjustScale(
            new Nat(cumulativeDiff.secondsPerLiquidityInside),
            new Nat(128),
            new Nat(30),
          ).toFixed(),
        ).to.equal(
          adjustScale(
            new Nat(expectedSPL.integerValue(BigNumber.ROUND_CEIL)),
            new Nat(128),
            new Nat(30),
          ).toFixed(),
        );
      }
    });
  });
});
