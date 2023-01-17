import { equal, rejects } from "assert";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";

import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { accounts } from "../sandbox/accounts";
import { CallMode } from "@madfish/quipuswap-v3/dist/types";
import env from "../env";
import { poolsFixture } from "./fixtures/poolFixture";
import { confirmOperation } from "../scripts/confirmation";
import {
  sendBatch,
  initTimedCumulativesBuffer,
  entries,
} from "@madfish/quipuswap-v3/dist/utils";
import { adjustScale } from "@madfish/quipuswap-v3/dist/helpers/math";

import { checkCumulativesBufferInvariants } from "./helpers/invariants";
import { Int, Nat, quipuswapV3Types } from "@madfish/quipuswap-v3/dist/types";
import {
  evalSecondsPerLiquidityX128,
  genNatIds,
  groupAdjacent,
  sleep,
  validDeadline,
} from "./helpers/utils";

const alice = accounts.alice;
const aliceSigner = new InMemorySigner(alice.sk);

const minTickIndex = new Int(-1048575);
const maxTickIndex = new Int(1048575);

describe("Timed oracles tests", async function () {
  let tezos: TezosToolkit;
  before(async () => {
    tezos = new TezosToolkit(env.networks.development.rpc);
    tezos.setSignerProvider(aliceSigner);
  });

  describe("Success cases", async function () {
    it("Setting large initial buffer works properly", async function () {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner],
        10,
      );

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        // Note: this also triggers the contract to record a value in the buffer
        await pool.setPosition(
          new Int(-100),
          new Int(100),
          minTickIndex,
          minTickIndex,
          new Nat(100),
          validDeadline(),
          new Nat(100),
          new Nat(100),
        );

        // Run invariants that can be checked immediately,
        // and return info (current storage) for performing later mass checks.
        const runInvariantsChecks = async () => {
          const s = await pool.getStorage(
            [new Nat(0)],
            [new Int(-100), new Int(100), minTickIndex, minTickIndex],
            genNatIds(20),
          );
          await checkCumulativesBufferInvariants(pool, s);
          return s;
        };

        const storageSnapshot0 = await (async () => {
          const st = await runInvariantsChecks();
          const cb = st.cumulativesBuffer;
          expect(cb.reservedLength.toNumber()).to.equal(11);
          expect(cb.first.toNumber()).to.equal(0);
          expect(cb.last.toNumber()).to.equal(1);
          return st;
        })();

        const storageSnapshot1 = await (async () => {
          await sleep(1000);
          await pool.swapXY(new Int(0), validDeadline(), new Nat(0), alice.pkh);
          await sleep(1000);
          await pool.swapXY(new Int(0), validDeadline(), new Nat(0), alice.pkh);

          const st = await runInvariantsChecks();
          const cb = st.cumulativesBuffer;
          expect(cb.reservedLength.toNumber()).to.equal(11);
          expect(cb.first.toNumber()).to.equal(0);
          expect(cb.last.toNumber()).to.equal(3);
          return st;
        })();

        const storageSnapshot2 = await (async () => {
          for (let i = 0; i < 10; i++) {
            await sleep(1000);
            await pool.swapXY(
              new Int(0),
              validDeadline(),
              new Nat(0),
              alice.pkh,
            );
          }

          const st = await runInvariantsChecks();
          const cb = st.cumulativesBuffer;
          expect(cb.reservedLength.toNumber()).to.equal(11);
          expect(cb.first.toNumber()).to.equal(3);
          expect(cb.last.toNumber()).to.equal(13);
          return st;
        })();

        const allStorageSnapshots = [
          storageSnapshot0,
          storageSnapshot1,
          storageSnapshot2,
        ];
        const vals = allStorageSnapshots
          .map(s => entries(s))
          .map(m => Array.from(m.values()))
          .flat();

        if (vals.every(v => vals[0] === v)) {
          throw new Error(
            "All values in the buffer were eventually equal, the test is not significant\n" +
              JSON.stringify(vals),
          );
        }
      }
    });
    it("Our initial buffer matches the ligo's one", async function () {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner],
      );

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const initCumulativeBuffer = await initTimedCumulativesBuffer(
          new Nat(0),
        );
        const initSt = await pool.getStorage(
          [],
          [minTickIndex, maxTickIndex],
          genNatIds(10),
        );

        expect(initSt.cumulativesBuffer.first.toFixed()).to.equal(
          initCumulativeBuffer.first.toFixed(),
        );
        expect(initSt.cumulativesBuffer.last.toFixed()).to.equal(
          initCumulativeBuffer.last.toFixed(),
        );
        expect(initSt.cumulativesBuffer.map.map).to.deep.equal(
          initCumulativeBuffer.map.map,
        );
        const initCumulativeBuffer10 = await initTimedCumulativesBuffer(
          new Nat(10),
        );

        expect(initCumulativeBuffer10.first.toFixed()).to.equal("0");
        expect(initCumulativeBuffer10.last.toFixed()).to.equal("0");
        expect(initCumulativeBuffer10.reservedLength.toFixed()).to.equal("11");

        for (const [k, v] of Object.entries(initCumulativeBuffer10.map.map)) {
          expect(v.spl.blockStartLiquidityValue.toFixed()).to.equal("0");
          expect(v.spl.sum.toFixed()).to.equal("0");
          expect(v.time.toFixed()).to.equal("0");
        }
      }
    });
    it("Returned cumulative values continuously grow over time", async function () {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner],
      );

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await pool.increaseObservationCount(new Nat(100));
        await sleep(3000);

        await pool.setPosition(
          new Int(-100),
          new Int(100),
          minTickIndex,
          minTickIndex,
          new Nat(100),
          validDeadline(),
          new Nat(100),
          new Nat(100),
        );
        await sleep(3000);

        let st = await pool.getStorage(
          [],
          [minTickIndex, maxTickIndex],
          genNatIds(110),
        );

        const checkedTimes = async (): Promise<string[]> => {
          const lastCumulatives = st.cumulativesBuffer.map.get(
            st.cumulativesBuffer.last,
          );
          const time = lastCumulatives.time;
          return [-3, -2, -1, 0].map(seconds => time.plus(seconds).toFixed());
        };
        /**
         * Our property of interest here:
         * lim{t -> record_time} cumulative(t) = cumulative(record_time)
         * We will also check places of regular growth at the same time.
         */

        const cumulatives: quipuswapV3Types.CumulativesValue[] =
          await pool.observe(await checkedTimes());

        const adjacents = groupAdjacent(cumulatives);

        const diffs = adjacents.map(([a, b]) => ({
          cvTickCumulative: b.tick_cumulative.minus(a.tick_cumulative),
          cvSecondsPerLiquidityCumulative:
            b.seconds_per_liquidity_cumulative.minus(
              a.seconds_per_liquidity_cumulative,
            ),
        }));

        const groups = diffs.reduce((acc, curr) => {
          const last = acc[acc.length - 1];
          if (last && last[0].tick_cumulative.eq(curr.cvTickCumulative)) {
            last.push({
              tick_cumulative: curr.cvTickCumulative,
              seconds_per_liquidity_cumulative: new quipuswapV3Types.x128n(
                curr.cvSecondsPerLiquidityCumulative,
              ),
            });
          } else {
            acc.push([
              {
                tick_cumulative: curr.cvTickCumulative,
                seconds_per_liquidity_cumulative: new quipuswapV3Types.x128n(
                  curr.cvSecondsPerLiquidityCumulative,
                ),
              },
            ]);
          }
          return acc;
        }, [] as quipuswapV3Types.CumulativesValue[][]);

        expect(groups.length).to.equal(1);
      }
    });
    it("Observing time out of bounds", async function () {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner],
      );

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await pool.increaseObservationCount(new Nat(100));

        const now =
          Date.parse((await tezos.rpc.getBlockHeader()).timestamp) / 1000;

        const requested = now - 100000;

        await rejects(pool.observe([requested.toFixed()]), (e: Error) => {
          equal(e.message.includes("108"), true);
          return true;
        });

        const requested2 = now + 1000;
        await rejects(pool.observe([requested2.toFixed()]), (e: Error) => {
          equal(e.message.includes("109"), true);
          return true;
        });
      }
    });
    it("Increasing observation count works as expected", async function () {
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner],
      );

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        /**
         * This helps to distinguish dummy and true values in the buffer
         * Note: this also triggers the contract to record a value in the buffer
         */
        await pool.setPosition(
          new Int(-100),
          new Int(100),
          minTickIndex,
          minTickIndex,
          new Nat(100),
          validDeadline(),
          new Nat(100),
          new Nat(100),
        );
        /**
         * Run invariants that can be checked immediately,
         * and return info (current storage) for performing later mass checks.
         */
        const runInvariantsChecks = async () => {
          const st = await pool.getStorage(
            [],
            [minTickIndex, maxTickIndex],
            genNatIds(110),
          );

          await checkCumulativesBufferInvariants(pool, st);
          return st;
        };

        const storageSnapshotInit = await (async () => {
          const st = await runInvariantsChecks();
          const cb = st.cumulativesBuffer;
          expect(cb.reservedLength.toNumber()).to.equal(1);
          expect(cb.first.toNumber()).to.equal(1);
          expect(cb.last.toNumber()).to.equal(1);
          return st;
        })();

        const incr = new Nat(5);
        await pool.increaseObservationCount(incr);

        const storageSnapshot0 = await (async () => {
          const st = await runInvariantsChecks();
          const cb = st.cumulativesBuffer;
          expect(cb.reservedLength.toNumber()).to.equal(1 + incr.toNumber());
          expect(cb.first.toNumber()).to.equal(2);
          expect(cb.last.toNumber()).to.equal(2);
          return st;
        })();

        /**
         * No dummy slots were consumed till this moment, checking how they are
         * getting filled now.
         * We had to do only one step ahead in the buffer till this point.
         */
        const storageSnapshots1: quipuswapV3Types.Storage[] = [];
        for (let i = 1; i <= incr.toNumber(); i++) {
          await sleep(1000);
          await pool.swapXY(new Int(0), validDeadline(), new Nat(0), alice.pkh);
          const st = await runInvariantsChecks();
          const cb = st.cumulativesBuffer;
          expect(cb.reservedLength.toNumber()).to.equal(1 + incr.toNumber());
          expect(cb.first.toNumber()).to.equal(2);
          expect(cb.last.toNumber()).to.equal(i + 2);
          storageSnapshots1.push(st);
        }

        // No more increase is expected
        const storageSnapshots2: quipuswapV3Types.Storage[] = [];
        for (let i = 1; i <= 3; i++) {
          await sleep(1000);
          await pool.swapXY(new Int(0), validDeadline(), new Nat(0), alice.pkh);
          const st = await runInvariantsChecks();
          const cb = st.cumulativesBuffer;
          expect(cb.reservedLength.toNumber()).to.equal(1 + incr.toNumber());
          expect(cb.first.toNumber()).to.equal(2 + i);
          expect(cb.last.toNumber()).to.equal(2 + incr.toNumber() + i);
          storageSnapshots2.push(st);
        }

        const allStorageSnapshots = [
          storageSnapshotInit,
          storageSnapshot0,
          ...storageSnapshots1,
          ...storageSnapshots2,
        ];
        const vals = allStorageSnapshots
          .map(s => entries(s))
          .map(m => Array.from(m.values()))
          .flat();

        if (vals.every(v => vals[0] === v)) {
          throw new Error(
            "All values in the buffer were eventually equal, the test is not significant\n" +
              JSON.stringify(vals),
          );
        }
      }
    });
    it("Observed values are sane: Seconds per liquidity cumulative", async function () {
      this.retries(3);
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1, consumer } =
        await poolsFixture(tezos, [aliceSigner]);

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        let cumulativesValues: quipuswapV3Types.CumulativesValue[] = [];
        let timedCumulativesBuffers: quipuswapV3Types.TimedCumulative[] = [];
        let ts = (await tezos.rpc.getBlockHeader()).timestamp;

        await pool.swapXY(new Int(0), validDeadline(), new Nat(0), alice.pkh);

        let now = Date.parse(ts) / 1000 + 2;
        cumulativesValues.push((await pool.observe([now.toString()]))[0]);
        let st = await pool.getStorage([], [], genNatIds(10));

        timedCumulativesBuffers.push(
          st.cumulativesBuffer.map.get(st.cumulativesBuffer.last),
        );

        await pool.setPosition(
          new Int(-100),
          new Int(100),
          minTickIndex,
          minTickIndex,
          new Nat(10),
          validDeadline(),

          new Nat(10),
          new Nat(10),
        );

        await sleep(10000);

        await pool.swapXY(new Int(0), validDeadline(), new Nat(0), alice.pkh);
        ts = (await tezos.rpc.getBlockHeader()).timestamp;
        now = Date.parse(ts) / 1000 + 1;
        cumulativesValues.push((await pool.observe([now.toString()]))[0]);
        st = await pool.getStorage([], [], genNatIds(10));

        timedCumulativesBuffers.push(
          st.cumulativesBuffer.map.get(st.cumulativesBuffer.last),
        );

        await pool.setPosition(
          new Int(-10),
          new Int(30),
          minTickIndex,
          minTickIndex,
          new Nat(40),
          validDeadline(),
          new Nat(40),
          new Nat(40),
        );

        await pool.setPosition(
          new Int(30),
          new Int(50),
          minTickIndex,
          minTickIndex,
          new Nat(10000),
          validDeadline(),
          new Nat(10000),
          new Nat(10000),
        );

        await sleep(5000);

        await pool.swapXY(new Int(0), validDeadline(), new Nat(0), alice.pkh);
        ts = (await tezos.rpc.getBlockHeader()).timestamp;
        now = Date.parse(ts) / 1000 + 1;
        cumulativesValues.push((await pool.observe([now.toString()]))[0]);
        st = await pool.getStorage([], [], genNatIds(10));

        timedCumulativesBuffers.push(
          st.cumulativesBuffer.map.get(st.cumulativesBuffer.last),
        );

        await pool.updatePosition(
          new Nat(0),
          new Int(-10),
          alice.pkh,
          alice.pkh,
          validDeadline(),
          new Nat(40),
          new Nat(40),
        );

        await sleep(10000);

        await pool.swapXY(new Int(0), validDeadline(), new Nat(0), alice.pkh);

        ts = (await tezos.rpc.getBlockHeader()).timestamp;
        now = Date.parse(ts) / 1000 + 1;
        cumulativesValues.push((await pool.observe([now.toString()]))[0]);
        st = await pool.getStorage([], [], genNatIds(10));

        timedCumulativesBuffers.push(
          st.cumulativesBuffer.map.get(st.cumulativesBuffer.last),
        );

        const splCums = cumulativesValues.map(
          r => r.seconds_per_liquidity_cumulative,
        );

        const adjacents = groupAdjacent(splCums);

        const combinedAdjacents = adjacents.map((innerList, i) => [
          ...innerList,
          timedCumulativesBuffers[i],
          timedCumulativesBuffers[i + 1],
        ]);

        const diffs = combinedAdjacents.map(([prev, next, prevTC, nextTC]) => {
          let aPrev = prev as quipuswapV3Types.x128n;
          let aNext = next as quipuswapV3Types.x128n;

          const aPrevTC = prevTC as quipuswapV3Types.TimedCumulative;
          const aNextTC = nextTC as quipuswapV3Types.TimedCumulative;
          if (aPrev.eq(new BigNumber(0))) {
            return [new Nat(0), new Nat(0)];
          }
          const timeDelta = aNextTC.time.minus(aPrevTC.time);
          const expectedSPL = evalSecondsPerLiquidityX128(
            aNextTC.spl.blockStartLiquidityValue,
            new BigNumber(timeDelta),
          );

          return [
            adjustScale(new Nat(aNext.minus(aPrev)), new Nat(128), new Nat(30)),
            adjustScale(
              new Nat(expectedSPL.integerValue(BigNumber.ROUND_CEIL)),
              new Nat(128),
              new Nat(30),
            ),
          ];
        });

        expect(diffs[0][0].toFixed()).to.equal("0");
        expect(diffs[1][0].toFixed()).to.equal(diffs[1][1].toFixed());
        expect(diffs[2][0].toFixed()).to.equal(diffs[2][1].toFixed());
      }
    });
    it("Observed values are sane: Tick cumulative", async function () {
      //this.retries(2);
      tezos.setSignerProvider(aliceSigner);
      const { poolFa12, poolFa2, poolFa1_2, poolFa2_1 } = await poolsFixture(
        tezos,
        [aliceSigner],
      );

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        let cumulativesValues: quipuswapV3Types.CumulativesValue[] = [];
        let timedCumulativesBuffers: quipuswapV3Types.TimedCumulative[] = [];
        await pool.swapYX(new Int(0), validDeadline(), new Nat(0), alice.pkh);
        let ts = (await tezos.rpc.getBlockHeader()).timestamp;
        let now = Date.parse(ts) / 1000 + 1;
        cumulativesValues.push((await pool.observe([now.toString()]))[0]);
        let stor = await pool.getStorage([], [], genNatIds(10));

        timedCumulativesBuffers.push(
          stor.cumulativesBuffer.map.get(stor.cumulativesBuffer.last),
        );
        let transferParams: any[] = [];
        pool.callSettings.setPosition = CallMode.returnParams;
        pool.callSettings.swapYX = CallMode.returnParams;
        transferParams.push(
          await pool.setPosition(
            new Int(-10),
            new Int(10),
            minTickIndex,
            minTickIndex,
            new Nat(10),
            validDeadline(),

            new Nat(10),
            new Nat(10),
          ),
        );
        transferParams.push(
          await pool.swapYX(new Int(2), validDeadline(), new Nat(0), alice.pkh),
        );
        let batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);
        transferParams = [];
        let st = await pool.getRawStorage();

        expect(st.cur_tick_index.toNumber()).to.equal(10);

        await sleep(10000);
        pool.callSettings.swapYX = CallMode.returnConfirmatedOperation;

        await pool.swapYX(new Int(0), validDeadline(), new Nat(0), alice.pkh);
        ts = (await tezos.rpc.getBlockHeader()).timestamp;
        now = Date.parse(ts) / 1000 + 1;
        cumulativesValues.push((await pool.observe([now.toString()]))[0]);
        stor = await pool.getStorage([], [], genNatIds(10));

        timedCumulativesBuffers.push(
          stor.cumulativesBuffer.map.get(stor.cumulativesBuffer.last),
        );

        transferParams.push(
          await pool.setPosition(
            new Int(-20),
            new Int(50),
            minTickIndex,
            minTickIndex,
            new Nat(10),
            validDeadline(),
            new Nat(10),
            new Nat(10),
          ),
        );
        pool.callSettings.swapXY = CallMode.returnParams;
        transferParams.push(
          await pool.swapXY(new Int(4), validDeadline(), new Nat(0), alice.pkh),
        );
        batchOp = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, batchOp.opHash);
        pool.callSettings.swapXY = CallMode.returnConfirmatedOperation;

        st = await pool.getRawStorage();
        expect(st.cur_tick_index.toNumber()).to.equal(-21);

        await sleep(10000);
        await pool.swapYX(new Int(0), validDeadline(), new Nat(0), alice.pkh);
        ts = (await tezos.rpc.getBlockHeader()).timestamp;
        now = Date.parse(ts) / 1000 + 1;
        cumulativesValues.push((await pool.observe([now.toString()]))[0]);
        stor = await pool.getStorage([], [], genNatIds(10));

        timedCumulativesBuffers.push(
          stor.cumulativesBuffer.map.get(stor.cumulativesBuffer.last),
        );

        const tickCums = cumulativesValues.map(r => r.tick_cumulative);

        const adjacents = groupAdjacent(tickCums);

        const combinedAdjacents = adjacents.map((innerList, i) => [
          ...innerList,
          timedCumulativesBuffers[i],
          timedCumulativesBuffers[i + 1],
        ]);

        const diffs = combinedAdjacents.map(([prev, next, prevTC, nextTC]) => {
          let aPrev = prev as Int;
          let aNext = next as Int;

          const aPrevTC = prevTC as quipuswapV3Types.TimedCumulative;
          const aNextTC = nextTC as quipuswapV3Types.TimedCumulative;
          const timeDelta = aNextTC.time.minus(aPrevTC.time);

          const expectedTickSum =
            aNextTC.tick.blockStartValue.multipliedBy(timeDelta);
          return [aNext.minus(aPrev), expectedTickSum];
        });
        expect(diffs[0][0].toFixed()).to.equal(diffs[0][1].toFixed());
        expect(diffs[1][0].toFixed()).to.equal(diffs[1][1].toFixed());
        pool.callSettings.setPosition = CallMode.returnConfirmatedOperation;
        pool.callSettings.swapYX = CallMode.returnConfirmatedOperation;
      }
    });
  });
});
