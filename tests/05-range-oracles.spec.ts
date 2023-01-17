import { equal, rejects } from "assert";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";

import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { accounts } from "../sandbox/accounts";
import env from "../env";
import { poolsFixture } from "./fixtures/poolFixture";
import { confirmOperation } from "../scripts/confirmation";

import { adjustScale } from "@madfish/quipuswap-v3/dist/helpers/math";

import { Int, Nat } from "@madfish/quipuswap-v3/dist/types";
import {
  evalSecondsPerLiquidityX128,
  getCumulativesInsideDiff,
  sleep,
  validDeadline,
} from "./helpers/utils";

const alice = accounts.alice;
const aliceSigner = new InMemorySigner(alice.sk);

const minTickIndex = new Int(-1048575);

describe("Range oracles tests", async function () {
  let tezos: TezosToolkit;
  before(async () => {
    tezos = new TezosToolkit(env.networks.development.rpc);
    tezos.setSignerProvider(aliceSigner);
  });

  describe("Failed cases", async function () {
    it("Asking at uninitialized tick causes an error", async () => {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1, consumer } =
        await poolsFixture(tezos, [aliceSigner]);

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
    it("Asking at empty range returns zeros", async function () {
      this.retries(3);
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1, consumer } =
        await poolsFixture(tezos, [aliceSigner]);

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        tezos.setSignerProvider(aliceSigner);

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
        console.log(pool.callSettings.setPosition);

        await sleep(3000);
        const op = await pool.contract.methodsObject
          .snapshot_cumulatives_inside({
            lower_tick_index: "0",
            upper_tick_index: "0",
            callback: consumer.address,
          })
          .send();
        await confirmOperation(tezos, op.hash);

        const st = await consumer.storage();
        console.log("st");
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
        await poolsFixture(tezos, [aliceSigner]);

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
        await poolsFixture(tezos, [aliceSigner]);
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
