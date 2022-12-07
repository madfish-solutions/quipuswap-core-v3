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

describe("Position Tests", async () => {
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
    it.skip("Shouldn't setting position with lower_tick=upper_tick", async () => {
      await rejects(
        poolFa12.setPosition(
          new BigNumber(100),
          new BigNumber(100),
          new BigNumber(-100),
          new BigNumber(100),
          new BigNumber(100),
          new Date("2023-01-01").toString(),
          new BigNumber(100),
          new BigNumber(100),
        ),
        (err: Error) => {
          equal(err.message.includes("110"), true);
          return true;
        },
      );
    });
    it.skip("Shouldn't setting a position with lower_tick>upper_tick", async () => {
      await rejects(
        poolFa12.setPosition(
          new BigNumber(100),
          new BigNumber(99),
          new BigNumber(-100),
          new BigNumber(100),
          new BigNumber(100),
          new Date("2023-01-01").toString(),
          new BigNumber(100),
          new BigNumber(100),
        ),
        (err: Error) => {
          equal(err.message.includes("110"), true);
          return true;
        },
      );
    });
    it.skip("Shouldn't setting a position with zero liquidity is a no-op", async () => {
      const prevLiquidity = (await poolFa12.getRawStorage()).liquidity;
      await poolFa12.setPosition(
        new BigNumber(-10),
        new BigNumber(10),
        new BigNumber(-10),
        new BigNumber(10),
        new BigNumber(0),
        new Date("2023-01-01").toString(),
        new BigNumber(100),
        new BigNumber(100),
      );
      const actualLiquidity = (await poolFa12.getRawStorage()).liquidity;
      deepEqual(prevLiquidity, actualLiquidity);
    });
    it.skip("Shouldn't setting a position with wrong ticket witness", async () => {
      await rejects(
        poolFa12.setPosition(
          new BigNumber(-10),
          new BigNumber(15),
          new BigNumber(minTickIndex + 1),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        ),
        (err: Error) => {
          equal(err.message.includes("105"), true);
          return true;
        },
      );
      await rejects(
        poolFa12.setPosition(
          new BigNumber(-10),
          new BigNumber(15),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex + 1),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        ),
        (err: Error) => {
          equal(err.message.includes("105"), true);
          return true;
        },
      );
      await rejects(
        poolFa12.setPosition(
          new BigNumber(-10),
          new BigNumber(15),
          new BigNumber(maxTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        ),
        (err: Error) => {
          equal(err.message.includes("100"), true);
          return true;
        },
      );
      await rejects(
        poolFa12.setPosition(
          new BigNumber(-10),
          new BigNumber(15),
          new BigNumber(minTickIndex),
          new BigNumber(maxTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        ),
        (err: Error) => {
          equal(err.message.includes("100"), true);
          return true;
        },
      );
    });
    it.skip("Shouldn't setting a position with past the deadline", async () => {
      await rejects(
        poolFa12.setPosition(
          new BigNumber(-10),
          new BigNumber(15),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2020-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        ),
        (err: Error) => {
          equal(err.message.includes("103"), true);
          return true;
        },
      );

      await poolFa12.setPosition(
        new BigNumber(-10),
        new BigNumber(15),
        new BigNumber(minTickIndex),
        new BigNumber(minTickIndex),
        new BigNumber(1e7),
        new Date("2023-01-01").toString(),
        new BigNumber(1e7),
        new BigNumber(1e7),
      );
      await rejects(
        poolFa12.updatePosition(
          new BigNumber(0),
          new BigNumber(-1e7),
          alice.pkh,
          alice.pkh,
          new Date("2021-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        ),
        (err: Error) => {
          equal(err.message.includes("103"), true);
          return true;
        },
      );
      await poolFa12.updatePosition(
        new BigNumber(0),
        new BigNumber(-1e7),
        alice.pkh,
        alice.pkh,
        new Date("2023-01-01").toString(),
        new BigNumber(1e7),
        new BigNumber(1e7),
      );
    });
    it.skip("Shouldn't setting a position if a tick index is not a multiple of 'tick_spacing'", async () => {
      const poolAddress = await factory.deployPool(
        fa12TokenX.contract.address,
        "fa12",
        fa12TokenY.contract.address,
        "fa12",
        0,
        10,
        MichelsonMap.fromLiteral({}),
      );
      const wrongPool = await new QuipuswapV3().init(tezos, poolAddress);
      wrongPool.setPosition(
        new BigNumber(-9),
        new BigNumber(20),
        new BigNumber(minTickIndex),
        new BigNumber(minTickIndex),
        new BigNumber(1e7),
        new Date("2023-01-01").toString(),
        new BigNumber(1e7),
        new BigNumber(1e7),
      ),
        (err: Error) => {
          console.log(err.message);
          equal(err.message.includes("112"), true);
          return true;
        };
      wrongPool.setPosition(
        new BigNumber(20),
        new BigNumber(-9),
        new BigNumber(minTickIndex),
        new BigNumber(minTickIndex),
        new BigNumber(1e7),
        new Date("2023-01-01").toString(),
        new BigNumber(1e7),
        new BigNumber(1e7),
      ),
        (err: Error) => {
          console.log(err.message);
          equal(err.message.includes("112"), true);
          return true;
        };
    });
    it.skip("Shouldn't setting a position if upper_tick > max_tick, for all tokens combinations", async () => {
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await rejects(
          pool.setPosition(
            new BigNumber(-10),
            new BigNumber(15),
            new BigNumber(minTickIndex - 1),
            new BigNumber(minTickIndex),
            new BigNumber(1e7),
            new Date("2023-01-01").toString(),
            new BigNumber(1e7),
            new BigNumber(1e7),
          ),
          (err: Error) => {
            equal(err.message.includes("105"), true);
            return true;
          },
        );
        await rejects(
          pool.setPosition(
            new BigNumber(-10),
            new BigNumber(15),
            new BigNumber(minTickIndex),
            new BigNumber(minTickIndex - 1),
            new BigNumber(1e7),
            new Date("2023-01-01").toString(),
            new BigNumber(1e7),
            new BigNumber(1e7),
          ),
          (err: Error) => {
            equal(err.message.includes("105"), true);
            return true;
          },
        );
      }
    });

    it.skip("Shouldn't transfer more than maximum_tokens_contributed for all token combinations", async () => {
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await rejects(
          pool.setPosition(
            new BigNumber(-10),
            new BigNumber(10),
            new BigNumber(minTickIndex),
            new BigNumber(minTickIndex),
            new BigNumber(1e7),
            new Date("2023-01-01").toString(),
            new BigNumber(1),
            new BigNumber(1),
          ),
          (err: Error) => {
            equal(err.message.includes("106"), true);
            return true;
          },
        );

        const storage = await pool.getRawStorage();
        await pool.setPosition(
          new BigNumber(-10),
          new BigNumber(10),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );

        await rejects(
          pool.updatePosition(
            storage.new_position_id,
            new BigNumber(1e7),
            alice.pkh,
            alice.pkh,
            new Date("2023-01-01").toString(),
            new BigNumber(1),
            new BigNumber(1),
          ),
          (err: Error) => {
            equal(err.message.includes("106"), true);
            return true;
          },
        );
      }
    });
    it.skip("Shouldn't withdrawing more liquidity from a position than it currently has", async () => {
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const storage = await pool.getRawStorage();
        const liquidityDelta = 10_000;
        const lowerTickIndex = -10;
        const upperTickIndex = 10;
        await pool.setPosition(
          new BigNumber(lowerTickIndex),
          new BigNumber(upperTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(liquidityDelta),
          new Date("2023-01-01").toString(),
          new BigNumber(liquidityDelta),
          new BigNumber(liquidityDelta),
        );
        tezos.setSignerProvider(bobSigner);
        await pool.setPosition(
          new BigNumber(lowerTickIndex),
          new BigNumber(upperTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(liquidityDelta),
          new Date("2023-01-01").toString(),
          new BigNumber(liquidityDelta),
          new BigNumber(liquidityDelta),
        );
        await rejects(
          pool.updatePosition(
            storage.new_position_id,
            new BigNumber(-liquidityDelta - 1),
            alice.pkh,
            alice.pkh,
            new Date("2023-01-01").toString(),
            new BigNumber(liquidityDelta),
            new BigNumber(liquidityDelta),
          ),
          (err: Error) => {
            equal(err.message.includes("111"), true);
            return true;
          },
        );
      }
    });
    it.skip("Shouldn't updating a non-existing position properly fails", async () => {
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await rejects(
          pool.updatePosition(
            new BigNumber(10),
            new BigNumber(0),
            alice.pkh,
            alice.pkh,
            new Date("2023-01-01").toString(),
            new BigNumber(0),
            new BigNumber(0),
          ),
          (err: Error) => {
            equal(err.message.includes("FA2_TOKEN_UNDEFINED"), true);
            return true;
          },
        );
      }
    });
    it.skip("Shouldn't attempt to update a non-existing position properly fails", async () => {
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await rejects(
          pool.updatePosition(
            new BigNumber(10),
            new BigNumber(0),
            alice.pkh,
            alice.pkh,
            new Date("2023-01-01").toString(),
            new BigNumber(0),
            new BigNumber(0),
          ),
          (err: Error) => {
            equal(err.message.includes("FA2_TOKEN_UNDEFINED"), true);
            return true;
          },
        );
      }
    });
  });
  describe("Success cases", async () => {
    it.skip("Should depositing and withdrawing the same amount of liquidity+", async () => {
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
      } = await poolsFixture(tezos, [aliceSigner], genFees(4, true));
      for (const pool of [_poolFa12, _poolFa2, _poolFa1_2, _poolFa2_1]) {
        const initialSt = await pool.getRawStorage();
        const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
        await pool.setPosition(
          new BigNumber(-10),
          new BigNumber(15),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        await pool.updatePosition(
          initialSt.new_position_id,
          new BigNumber(-1e7),
          alice.pkh,
          alice.pkh,
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        const poolStorage = (await pool.contract.storage()) as any;
        const xBalance = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          pool.contract.address,
        );
        const yBalance = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          pool.contract.address,
        );
        // The contract's balance should be 0.
        // There is a margin of error, so the contract may end up with at most 1 token.
        expect(xBalance.toNumber()).to.be.closeTo(0, 1);
        expect(yBalance.toNumber()).to.be.closeTo(0, 1);
        equal(
          poolStorage.new_position_id.toNumber(),
          initialSt.new_position_id.toNumber() + 1,
        );
      }
    });
    it.skip("Should adding liquidity twice is the same as adding it onc+", async () => {
      tezos.setSignerProvider(aliceSigner);
      const {
        factory: _factory,
        fa12TokenX: _fa12TokenX,
        fa12TokenY: _fa12TokenY,
        fa2TokenX: _fa2TokenX,
        fa2TokenY: _fa2TokenY,
        poolFa12: poolFa12,
        poolFa2: poolFa2,
        poolFa1_2: poolFa1_2,
        poolFa2_1: poolFa2_1,
        poolFa12Dublicate: poolFa12Dublicate,
        poolFa2Dublicate: poolFa2Dublicate,
        poolFa1_2Dublicate: poolFa1_2Dublicate,
        poolFa2_1Dublicate: poolFa2_1Dublicate,
      } = await poolsFixture(tezos, [aliceSigner], genFees(8, true), true);
      for (const pools of [
        [poolFa12, poolFa12Dublicate],
        [poolFa2, poolFa2Dublicate],
        [poolFa1_2, poolFa1_2Dublicate],
        [poolFa2_1, poolFa2_1Dublicate],
      ]) {
        const [pool1, pool2] = pools;
        const defaultCallSettings: CallSettings = {
          swapXY: CallMode.returnParams,
          swapYX: CallMode.returnParams,
          setPosition: CallMode.returnParams,
          updatePosition: CallMode.returnParams,
          transfer: CallMode.returnParams,
          updateOperators: CallMode.returnParams,
          increaseObservationCount: CallMode.returnParams,
        };
        const onlyTransferPool1 = await new QuipuswapV3(
          defaultCallSettings,
        ).init(tezos, pool1.contract.address);
        const onlyTransferPool2 = await new QuipuswapV3(
          defaultCallSettings,
        ).init(tezos, pool2.contract.address);
        const initialSt = await pool1.getRawStorage();
        const inistSt2 = await pool2.getRawStorage();
        let transferParams: any = [
          await onlyTransferPool1.setPosition(
            new BigNumber(-10),
            new BigNumber(15),
            new BigNumber(minTickIndex),
            new BigNumber(minTickIndex),
            new BigNumber(1e7),
            new Date("2023-01-01").toString(),
            new BigNumber(1e7),
            new BigNumber(1e7),
          ),
          await onlyTransferPool1.updatePosition(
            initialSt.new_position_id,
            new BigNumber(1e7),
            alice.pkh,
            alice.pkh,
            new Date("2023-01-01").toString(),
            new BigNumber(1e7),
            new BigNumber(1e7),
          ),
          await onlyTransferPool2.setPosition(
            new BigNumber(-10),
            new BigNumber(15),
            new BigNumber(minTickIndex),
            new BigNumber(minTickIndex),
            new BigNumber(2e7),
            new Date("2023-01-01").toString(),
            new BigNumber(2e7),
            new BigNumber(2e7),
          ),
        ];
        const ops = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, ops.opHash);
        const poolStorage1 = await pool1.getStorage(
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            new Int(-10),
            new Int(15),
          ],
          [new Nat(0), new Nat(1), new Nat(2)],
        );
        const poolStorage2 = await pool2.getStorage(
          [new Nat(0)],
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            new Int(-10),
            new Int(15),
          ],
          [new Nat(0), new Nat(1), new Nat(2)],
        );
        compareStorages(poolStorage1, poolStorage2);
        const xBalance1 = await getTypedBalance(
          tezos,
          Object.keys(initialSt.constants.token_x)[0],
          initialSt.constants.token_x,
          pool1.contract.address,
        );
        const yBalance1 = await getTypedBalance(
          tezos,
          Object.keys(initialSt.constants.token_y)[0],
          initialSt.constants.token_y,
          pool1.contract.address,
        );
        const xBalance2 = await getTypedBalance(
          tezos,
          Object.keys(initialSt.constants.token_x)[0],
          initialSt.constants.token_x,
          pool2.contract.address,
        );
        const yBalance2 = await getTypedBalance(
          tezos,
          Object.keys(initialSt.constants.token_y)[0],
          initialSt.constants.token_y,
          pool2.contract.address,
        );
        expect(xBalance1.toNumber()).to.be.closeTo(xBalance2.toNumber(), 1);
        expect(yBalance1.toNumber()).to.be.closeTo(yBalance2.toNumber(), 1);
        expect(xBalance2.toNumber()).to.be.closeTo(xBalance2.toNumber(), 1);
        expect(yBalance2.toNumber()).to.be.closeTo(yBalance2.toNumber(), 1);
      }
    });
    it.skip("Should be lowest and highest ticks cannot be garbage collected", async () => {
      tezos.setSignerProvider(aliceSigner);
      const {
        factory: _factory,
        fa12TokenX: fa12TokenX,
        fa12TokenY: fa12TokenY,
        fa2TokenX: fa2TokenX,
        fa2TokenY: fa2TokenY,
        poolFa12: poolFa12,
        poolFa2: poolFa2,
        poolFa1_2: poolFa1_2,
        poolFa2_1: poolFa2_1,
      } = await poolsFixture(tezos, [aliceSigner], genFees(8, true), true);
      const sleep = (ms: number) =>
        new Promise(resolve => setTimeout(resolve, ms));
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const initialSt = await pool.getStorage(
          [],
          [new Int(minTickIndex), new Int(maxTickIndex)],
          genNatIds(10),
        );
        await pool.setPosition(
          new BigNumber(minTickIndex),
          new BigNumber(maxTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1),
          new Date("2023-01-01").toString(),
          new BigNumber(1),
          new BigNumber(1),
        );
        //await sleep(5000);
        await pool.updatePosition(
          initialSt.newPositionId,
          new BigNumber(-1),
          alice.pkh,
          alice.pkh,
          new Date("2023-01-01").toString(),
          new BigNumber(0),
          new BigNumber(0),
        );
        const poolStorage = await pool.updateStorage(
          [new Nat(0)],
          [new Int(minTickIndex), new Int(maxTickIndex)],
          genNatIds(10),
        );
        // The storage shouldn't have changed (with few exceptions).

        const now =
          Date.parse((await tezos.rpc.getBlockHeader()).timestamp) / 1000;
        initialSt.newPositionId = new Nat(initialSt.newPositionId.plus(1));
        initialSt.cumulativesBuffer = await cumulativesBuffer1(now.toString());
        // console.log(
        //   await ((await pool.contract.storage()) as any).ticks.get(
        //     minTickIndex,
        //   ),
        // );
        compareStorages(initialSt, poolStorage);
      }
    });
    it.skip("Should allow Liquidity Providers earning fees from swaps", async () => {
      const fees = genFees(4);
      const swappers = [bobSigner, peterSigner];
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
      } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner, peterSigner],
        fees,
      );
      factory = _factory;
      fa12TokenX = _fa12TokenX;
      fa12TokenY = _fa12TokenY;
      fa2TokenX = _fa2TokenX;
      fa2TokenY = _fa2TokenY;
      poolFa12 = _poolFa12;
      poolFa2 = _poolFa2;
      poolFa1_2 = _poolFa1_2;
      poolFa2_1 = _poolFa2_1;
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        tezos.setSignerProvider(aliceSigner);
        const transferAmount = new BigNumber(Math.floor(Math.random() * 1e4));
        const initialSt = await pool.getRawStorage();
        const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];

        const prevEveBalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          eve.pkh,
        );
        const prevEveBalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          eve.pkh,
        );
        await pool.setPosition(
          new BigNumber(-10000),
          new BigNumber(10000),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        let xFees: BigNumber = new BigNumber(0);
        let yFees: BigNumber = new BigNumber(0);
        for (const swapper of swappers) {
          const initialSt = await pool.getRawStorage();
          const feeBps = initialSt.constants.fee_bps;
          tezos.setSignerProvider(swapper);
          const swapperAddr = await swapper.publicKeyHash();
          await pool.swapXY(
            transferAmount,
            new Date("2023-01-01").toString(),
            new BigNumber(1),
            swapperAddr,
          );
          await pool.swapYX(
            transferAmount,
            new Date("2023-01-01").toString(),
            new BigNumber(1),
            swapperAddr,
          );

          const storage = await pool.getRawStorage();
          const xFee = calcSwapFee(feeBps, transferAmount);
          const yFee = calcSwapFee(feeBps, transferAmount);
          xFees = xFees.plus(xFee);
          yFees = yFees.plus(yFee);
        }
        tezos.setSignerProvider(aliceSigner);
        await collectFees(pool, eve.pkh, [initialSt.new_position_id]);
        const eveBalanceX = (
          await getTypedBalance(
            tezos,
            tokenTypeX,
            initialSt.constants.token_x,
            eve.pkh,
          )
        ).minus(prevEveBalanceX);
        const eveBalanceY = (
          await getTypedBalance(
            tezos,
            tokenTypeY,
            initialSt.constants.token_y,
            eve.pkh,
          )
        ).minus(prevEveBalanceY);
        ok(isInRangeNat(eveBalanceX, xFees, new Nat(1), new Nat(0)));
        ok(isInRangeNat(eveBalanceY, yFees, new Nat(1), new Nat(0)));
        /**  Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable. */
        expect(shiftRight(xFees, new BigNumber(128)).toNumber()).to.be.closeTo(
          0,
          1,
        );
        expect(shiftRight(yFees, new BigNumber(128)).toNumber()).to.be.closeTo(
          0,
          1,
        );
      }
    });
    it.skip("Should allow Liquidity Providers earning fees proportional to their liquidity", async () => {
      const fees = [
        Math.floor(Math.random() * 1e4),
        Math.floor(Math.random() * 1e4),
        Math.floor(Math.random() * 1e4),
        Math.floor(Math.random() * 1e4),
      ];
      const swappers = [bobSigner, peterSigner];
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
      } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner, peterSigner, eveSigner],
        fees,
      );
      factory = _factory;
      fa12TokenX = _fa12TokenX;
      fa12TokenY = _fa12TokenY;
      fa2TokenX = _fa2TokenX;
      fa2TokenY = _fa2TokenY;
      poolFa12 = _poolFa12;
      poolFa2 = _poolFa2;
      poolFa1_2 = _poolFa1_2;
      poolFa2_1 = _poolFa2_1;
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const transferAmount = new BigNumber(Math.floor(Math.random() * 1e4));
        const initialSt = await pool.getRawStorage();
        const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
        tezos.setSignerProvider(eveSigner);
        await pool.setPosition(
          new BigNumber(-10000),
          new BigNumber(10000),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        tezos.setSignerProvider(aliceSigner);
        await pool.setPosition(
          new BigNumber(-10000),
          new BigNumber(10000),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7 * 3),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7 * 3),
          new BigNumber(1e7 * 3),
        );
        const prevEveBalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          eve.pkh,
        );
        const prevEveBalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          eve.pkh,
        );
        const prevAliceBalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          alice.pkh,
        );
        const prevAliceBalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          alice.pkh,
        );
        let xFees: BigNumber = new BigNumber(0);
        let yFees: BigNumber = new BigNumber(0);
        for (const swapper of swappers) {
          const initialSt = await pool.getRawStorage();
          const feeBps = initialSt.constants.fee_bps;
          const prevXFeeBalance = initialSt.fee_growth.x;
          const prevYFeeBalance = initialSt.fee_growth.y;
          tezos.setSignerProvider(swapper);
          const swapperAddr = await swapper.publicKeyHash();
          await pool.swapXY(
            transferAmount,
            new Date("2023-01-01").toString(),
            new BigNumber(1),
            swapperAddr,
          );
          await pool.swapYX(
            transferAmount,
            new Date("2023-01-01").toString(),
            new BigNumber(1),
            swapperAddr,
          );
          const storage = await pool.getRawStorage();
          const xFeeBalance = storage.fee_growth.x;
          const yFeeBalance = storage.fee_growth.y;
          const xFee = calcSwapFee(feeBps, transferAmount);
          const yFee = calcSwapFee(feeBps, transferAmount);
          xFees = xFees.plus(xFee);
          yFees = yFees.plus(yFee);
        }
        const st = await pool.getRawStorage();
        const poolSt = await pool.getStorage();
        const upperTi = new Int(10000);
        const lowerTi = new Int(-10000);
        const st2 = await pool.getStorage(
          [(new Nat(0), new Nat(1))],
          [new Int(minTickIndex), new Int(maxTickIndex), lowerTi, upperTi],
          [new Nat(0), new Nat(1), new Nat(2), new Nat(3), new Nat(4)],
        );
        await checkAllInvariants(
          pool,
          { [alice.pkh]: aliceSigner, [eve.pkh]: eveSigner },
          [new Nat(0), new Nat(1), new Nat(2)],
          [new Int(minTickIndex), new Int(maxTickIndex), lowerTi, upperTi],
          genNatIds(50),
        );
        tezos.setSignerProvider(aliceSigner);
        await collectFees(pool, eve.pkh, [initialSt.new_position_id]);
        await collectFees(pool, alice.pkh, [initialSt.new_position_id.plus(1)]);
        const eveBalanceX = (
          await getTypedBalance(
            tezos,
            tokenTypeX,
            initialSt.constants.token_x,
            eve.pkh,
          )
        ).minus(prevEveBalanceX);
        const eveBalanceY = (
          await getTypedBalance(
            tezos,
            tokenTypeY,
            initialSt.constants.token_y,
            eve.pkh,
          )
        ).minus(prevEveBalanceY);
        const aliceBalanceX = (
          await getTypedBalance(
            tezos,
            tokenTypeX,
            initialSt.constants.token_x,
            alice.pkh,
          )
        ).minus(prevAliceBalanceX);
        const aliceBalanceY = (
          await getTypedBalance(
            tezos,
            tokenTypeY,
            initialSt.constants.token_y,
            alice.pkh,
          )
        ).minus(prevAliceBalanceY);
        /**
         *  -- Position 2 has triple the liquidity of Position 1,
            -- so `feeReceiver1` should get 1/4 of all earned fees and `feeReceiver2` should get 3/4.
            -- Note: Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable.
        */
        ok(
          isInRangeNat(
            eveBalanceX,
            xFees.dividedBy(4),
            new BigNumber(1),
            new BigNumber(0),
          ),
        );
        ok(
          isInRangeNat(
            eveBalanceY,
            yFees.dividedBy(4),
            new BigNumber(1),
            new BigNumber(0),
          ),
        );
        ok(
          isInRangeNat(
            aliceBalanceX,
            xFees.multipliedBy(3).dividedBy(4),
            new BigNumber(1),
            new BigNumber(0),
          ),
        );
        ok(
          isInRangeNat(
            aliceBalanceY,
            yFees.multipliedBy(3).dividedBy(4),
            new BigNumber(1),
            new BigNumber(0),
          ),
        );
      }
    });
    it.skip("Liquidity Providers do not receive past fees", async () => {
      const swapper = peterSigner;
      const feeReceiver1 = carol.pkh;
      const feeReceiver2 = sara.pkh;
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
      } = await poolsFixture(
        tezos,
        [aliceSigner, bobSigner, peterSigner],
        genFees(4),
      );

      factory = _factory;
      fa12TokenX = _fa12TokenX;
      fa12TokenY = _fa12TokenY;
      fa2TokenX = _fa2TokenX;
      fa2TokenY = _fa2TokenY;
      poolFa12 = _poolFa12;
      poolFa2 = _poolFa2;
      poolFa1_2 = _poolFa1_2;
      poolFa2_1 = _poolFa2_1;
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const transferAmountB = new BigNumber(Math.floor(Math.random() * 1e4));
        const transferAmountA = new BigNumber(Math.floor(Math.random() * 1e4));
        const initialSt = await pool.getRawStorage();
        const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
        const feeBps = initialSt.constants.fee_bps;
        const prevXFeeBalance = initialSt.fee_growth.x;
        const prevYFeeBalance = initialSt.fee_growth.y;
        const prevfeeReceiver1BalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          feeReceiver1,
        );
        const prevfeeReceiver1BalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          feeReceiver1,
        );
        const prevfeeReceiver2BalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          feeReceiver2,
        );
        const prevfeeReceiver2BalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          feeReceiver2,
        );

        tezos.setSignerProvider(aliceSigner);
        await pool.setPosition(
          new BigNumber(-10000),
          new BigNumber(10000),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );

        tezos.setSignerProvider(swapper);
        const swapperAddr = await swapper.publicKeyHash();
        await pool.swapXY(
          transferAmountB,
          new Date("2023-01-01").toString(),
          new BigNumber(1),
          swapperAddr,
        );
        await pool.swapYX(
          transferAmountB,
          new Date("2023-01-01").toString(),
          new BigNumber(1),
          swapperAddr,
        );

        const storage = await pool.getRawStorage();
        const xFeeBalance = storage.fee_growth.x;
        const yFeeBalance = storage.fee_growth.y;
        const prevXBefore = calcSwapFee(feeBps, transferAmountB);
        const prevYBefore = calcSwapFee(feeBps, transferAmountB);
        tezos.setSignerProvider(bobSigner);

        await pool.setPosition(
          new BigNumber(-10000),
          new BigNumber(10000),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        tezos.setSignerProvider(swapper);

        await pool.swapXY(
          transferAmountA,
          new Date("2023-01-01").toString(),
          new BigNumber(1),
          swapperAddr,
        );
        await pool.swapYX(
          transferAmountA,
          new Date("2023-01-01").toString(),
          new BigNumber(1),
          swapperAddr,
        );

        const storage2 = await pool.getRawStorage();
        const xFeeBalance2 = storage2.fee_growth.x;
        const yFeeBalance2 = storage2.fee_growth.y;
        const prevXAfter = calcSwapFee(feeBps, transferAmountA);
        const prevYAfter = calcSwapFee(feeBps, transferAmountA);
        await checkAllInvariants(
          pool,
          [],
          genNatIds(2),
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            new Int(-10000),
            new Int(10000),
          ],
          genNatIds(50),
        );
        tezos.setSignerProvider(aliceSigner);
        await collectFees(pool, feeReceiver1, [new BigNumber(0)]);
        tezos.setSignerProvider(bobSigner);
        await collectFees(pool, feeReceiver2, [new BigNumber(1)]);
        const st = await pool.getRawStorage();
        const feeReceiver1BalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          feeReceiver1,
        );
        const feeReceiver1BalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          feeReceiver1,
        );
        const feeReceiver2BalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          feeReceiver2,
        );
        const feeReceiver2BalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          feeReceiver2,
        );
        /**
       *   feeReceiver1BalanceX `isInRangeNat` (xFeesBefore + (xFeesAfter `div` 2)) $ (1, 0)
        feeReceiver1BalanceY `isInRangeNat` (yFeesBefore + (yFeesAfter `div` 2)) $ (1, 0)
        feeReceiver2BalanceX `isInRangeNat` (xFeesAfter `div` 2) $ (1, 0)
        feeReceiver2BalanceY `isInRangeNat` (yFeesAfter `div` 2) $ (1, 0)
       */

        // console.log(prevfeeReceiver1BalanceX.toFixed());
        // console.log(feeReceiver1BalanceX.toFixed());
        // console.log(prevXBefore.plus(prevXAfter.div(2)).toFixed());

        // console.log(feeReceiver2BalanceX.toFixed());
        // console.log(prevXAfter.div(2).toFixed());
        ok(
          isInRangeNat(
            feeReceiver1BalanceX.minus(prevfeeReceiver1BalanceX),
            prevXBefore.plus(prevXAfter.div(2)),
            new BigNumber(1),
            new BigNumber(0),
          ),
        );
        ok(
          isInRangeNat(
            feeReceiver1BalanceY.minus(prevfeeReceiver1BalanceY),
            prevYBefore.plus(prevYAfter.div(2)),
            new BigNumber(1),
            new BigNumber(0),
          ),
        );
        ok(
          isInRangeNat(
            feeReceiver2BalanceX.minus(prevfeeReceiver2BalanceX),
            prevXAfter.div(2),
            new BigNumber(1),
            new BigNumber(0),
          ),
        );
        ok(
          isInRangeNat(
            feeReceiver2BalanceY.minus(prevfeeReceiver2BalanceY),
            prevYAfter.div(2),
            new BigNumber(1),
            new BigNumber(0),
          ),
        );
        await checkAllInvariants(
          pool,
          [],
          genNatIds(2),
          [
            new Int(minTickIndex),
            new Int(maxTickIndex),
            new Int(-10000),
            new Int(10000),
          ],
          genNatIds(50),
        );
        // (xFeesBefore, yFeesBefore) <- placeSwaps beforeSwaps from Haskel to TS
      }
    });
    it.skip("Should allow accrued fees are discounted when adding liquidity to an existing position", async () => {
      const lowerTickIndex = -10000;
      const upperTickIndex = 10000;
      const swappers = [bobSigner, peterSigner];
      const feeReceiver = sara.pkh;
      //const cerychSigner = new InMemorySigner(accounts.peter.sk);
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
      } = await poolsFixture(
        tezos,
        [aliceSigner, peterSigner, bobSigner],
        genFees(4, false),
      );

      factory = _factory;
      fa12TokenX = _fa12TokenX;
      fa12TokenY = _fa12TokenY;
      fa2TokenX = _fa2TokenX;
      fa2TokenY = _fa2TokenY;
      poolFa12 = _poolFa12;
      poolFa2 = _poolFa2;
      poolFa1_2 = _poolFa1_2;
      poolFa2_1 = _poolFa2_1;
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const transferAmount = new BigNumber(Math.floor(Math.random() * 1e4));
        const initialSt = await pool.getRawStorage();
        const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
        tezos.setSignerProvider(aliceSigner);
        await pool.setPosition(
          new BigNumber(lowerTickIndex),
          new BigNumber(upperTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        let xFees: BigNumber = new BigNumber(0);
        let yFees: BigNumber = new BigNumber(0);
        for (const swapper of swappers) {
          const initialSt = await pool.getRawStorage();
          const feeBps = initialSt.constants.fee_bps;
          tezos.setSignerProvider(swapper);
          const swapperAddr = await swapper.publicKeyHash();
          await pool.swapXY(
            transferAmount,
            new Date("2023-01-01").toString(),
            new BigNumber(1),
            swapperAddr,
          );
          await pool.swapYX(
            transferAmount,
            new Date("2023-01-01").toString(),
            new BigNumber(1),
            swapperAddr,
          );
          const storage = await pool.getRawStorage();
          const xFee = calcSwapFee(feeBps, transferAmount);
          const yFee = calcSwapFee(feeBps, transferAmount);
          xFees = xFees.plus(xFee);
          yFees = yFees.plus(yFee);
        }
        tezos.setSignerProvider(aliceSigner);
        const aliceBalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          alice.pkh,
        );
        const aliceBalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          alice.pkh,
        );
        await pool.updatePosition(
          new BigNumber(0),
          new BigNumber(1e7),
          feeReceiver,
          feeReceiver,
          new Date("2023-01-01T00:00:00Z").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        const storage = await pool.getRawStorage();
        const finalAliceBalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          alice.pkh,
        );
        const finalAliceBalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          alice.pkh,
        );
        const feeReceiverBalanceX = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          feeReceiver,
        );
        const feeReceiverBalanceY = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          feeReceiver,
        );
        //let PerToken xDelta yDelta = liquidityDeltaToTokensDelta (fromIntegral liquidityDelta) lowerTickIndex upperTickIndex (sCurTickIndexRPC st) (sSqrtPriceRPC st)
        const liquidityDelta = liquidityDeltaToTokensDelta(
          new Int(1e7),
          new Int(lowerTickIndex),
          new Int(upperTickIndex),
          new Int(storage.cur_tick_index),
          new Nat(storage.sqrt_price),
        );
        const xDelta = liquidityDelta.x;
        const yDelta = liquidityDelta.y;
        /**
         * Note: Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable.
         * Due to the floating-point math used in `liquidityDeltaToTokensDelta`, it's possible there
         * will be an additional +/- 1 error.
         */
        ok(
          isInRangeNat(
            finalAliceBalanceX,
            aliceBalanceX.plus(xFees).minus(xDelta),
            new BigNumber(2),
            new BigNumber(1),
          ),
        );
        ok(
          isInRangeNat(
            finalAliceBalanceY,
            aliceBalanceY.plus(yFees).minus(yDelta),
            new BigNumber(2),
            new BigNumber(1),
          ),
        );
        /**
         * `feeReceiver` should not receive any fees.
         */
        strictEqual(feeReceiverBalanceX.toFixed(), "0");
        strictEqual(feeReceiverBalanceY.toFixed(), "0");
      }
    });
    it.skip("Should Liquidating a position in small steps is (mostly) equivalent to doing it all at once", async () => {
      const lowerTickIndex = -10000;
      const upperTickIndex = 10000;
      const liquidityDelta = new BigNumber(1e7);
      const swapper = bobSigner;
      const liquidityProvider1 = aliceSigner;
      const liquidityProvider2 = eveSigner;
      const receiver1 = sara.pkh;
      const receiver2 = dave.pkh;
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
      } = await poolsFixture(
        tezos,
        [aliceSigner, eveSigner, bobSigner],
        [50_00, 50_00, 50_00, 50_00],
      );
      factory = _factory;
      fa12TokenX = _fa12TokenX;
      fa12TokenY = _fa12TokenY;
      fa2TokenX = _fa2TokenX;
      fa2TokenY = _fa2TokenY;
      poolFa12 = _poolFa12;
      poolFa2 = _poolFa2;
      poolFa1_2 = _poolFa1_2;
      poolFa2_1 = _poolFa2_1;
      const swapData = [
        { swapDirection: "XToY", swapAmt: new BigNumber(1000) },
        { swapDirection: "YToX", swapAmt: new BigNumber(3000) },
        { swapDirection: "XToY", swapAmt: new BigNumber(400) },
      ];
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const initialSt = await pool.getRawStorage();
        const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];
        tezos.setSignerProvider(liquidityProvider1);
        await pool.setPosition(
          new BigNumber(lowerTickIndex),
          new BigNumber(upperTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        tezos.setSignerProvider(liquidityProvider2);
        await pool.setPosition(
          new BigNumber(lowerTickIndex),
          new BigNumber(upperTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(1e7),
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        tezos.setSignerProvider(bobSigner);
        const swapperAddr = await swapper.publicKeyHash();
        const newCallSettings: CallSettings = {
          swapXY: CallMode.returnParams,
          swapYX: CallMode.returnParams,
          setPosition: CallMode.returnParams,
          updatePosition: CallMode.returnConfirmatedOperation,
          transfer: CallMode.returnParams,
          updateOperators: CallMode.returnParams,
          increaseObservationCount: CallMode.returnConfirmatedOperation,
        };
        pool.setCallSetting(newCallSettings);
        let transferParams: any = [];
        for (const { swapDirection, swapAmt } of swapData) {
          switch (swapDirection) {
            case "XToY":
              transferParams.push(
                await pool.swapXY(
                  swapAmt,
                  new Date("2023-01-01").toString(),
                  new BigNumber(1),
                  swapperAddr,
                ),
              );
              break;
            default:
              transferParams.push(
                await pool.swapYX(
                  swapAmt,
                  new Date("2023-01-01").toString(),
                  new BigNumber(1),
                  swapperAddr,
                ),
              );
          }
        }

        const swapOps = await sendBatch(tezos, transferParams);
        await confirmOperation(tezos, swapOps.opHash);
        // -- Liquidate the position all at once
        //withSender liquidityProvider1 $ updatePosition cfmm receiver1 (- toInteger liquidityDelta) 0
        tezos.setSignerProvider(liquidityProvider1);
        await pool.updatePosition(
          new BigNumber(0),
          new BigNumber(-liquidityDelta),
          receiver1,
          receiver1,
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        // -- Liquidate the position in small steps
        //  -- Doing all 10 calls in one batch may go over the gas limit,
        //  -- so we do it in 2 batches of 5 instead.
        newCallSettings.updatePosition = CallMode.returnParams;
        pool.setCallSetting(newCallSettings);
        tezos.setSignerProvider(liquidityProvider2);
        const updatePositionParams: any = [];
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 5; j++) {
            updatePositionParams.push(
              await pool.updatePosition(
                new BigNumber(1),
                new BigNumber(-liquidityDelta.div(10)),
                receiver2,
                receiver2,
                new Date("2023-01-01").toString(),
                new BigNumber(1e7),
                new BigNumber(1e7),
              ),
            );
          }
        }
        const updatePositionOps = await sendBatch(tezos, updatePositionParams);
        await confirmOperation(tezos, updatePositionOps.opHash);
        // -- Check that the balances are the same
        const balanceReceiver1X = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          receiver1,
        );
        const balanceReceiver1Y = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          receiver1,
        );
        const balanceReceiver2X = await getTypedBalance(
          tezos,
          tokenTypeX,
          initialSt.constants.token_x,
          receiver2,
        );
        const balanceReceiver2Y = await getTypedBalance(
          tezos,
          tokenTypeY,
          initialSt.constants.token_y,
          receiver2,
        );
        // -- Liquidating in 10 smaller steps may lead
        // -- to `receiver2` receiving up to 10 fewer tokens due to rounding errors.
        // balanceReceiver2X `isInRangeNat` balanceReceiver1X $ (10, 0)
        // balanceReceiver2Y `isInRangeNat` balanceReceiver1Y $ (10, 0)
        // тут разрброс больше чуть
        // console.log("balanceReceiver1X", balanceReceiver1X.toString());
        // console.log("balanceReceiver1Y", balanceReceiver1Y.toString());
        // console.log("balanceReceiver2X", balanceReceiver2X.toString());
        // console.log("balanceReceiver2Y", balanceReceiver2Y.toString());
        // console.log("diffX", balanceReceiver1X.minus(balanceReceiver2X));
        // console.log("diffY", balanceReceiver1Y.minus(balanceReceiver2Y));
        ok(
          isInRangeNat(
            balanceReceiver2X,
            balanceReceiver1X,
            new BigNumber(10),
            new BigNumber(0),
          ),
        );
        ok(
          isInRangeNat(
            balanceReceiver2Y,
            balanceReceiver1Y,
            new BigNumber(10),
            new BigNumber(0),
          ),
        );
      }
    });
    it.skip("Should Ticks' states are updating correctly when an overlapping position is created", async () => {
      const liquidityProvider = aliceSigner;
      tezos.setSignerProvider(liquidityProvider);
      const swapper = bobSigner;

      let liquidityDelta = 1e5;

      let ti1 = new Int(0);
      let ti2 = new Int(50);
      let ti3 = new Int(100);
      let ti4 = new Int(150);
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

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        tezos.setSignerProvider(liquidityProvider);
        pool.callSettings.setPosition = CallMode.returnParams;
        const setPositionParams = [
          await pool.setPosition(
            ti1,
            ti3,
            new BigNumber(minTickIndex),
            new BigNumber(minTickIndex),
            new BigNumber(liquidityDelta),
            new Date("2023-01-01").toString(),
            new BigNumber(liquidityDelta),
            new BigNumber(liquidityDelta),
          ),
          await pool.setPosition(
            ti2,
            ti4,
            new BigNumber(minTickIndex),
            new BigNumber(minTickIndex),
            new BigNumber(liquidityDelta),
            new Date("2023-01-01").toString(),
            new BigNumber(liquidityDelta),
            new BigNumber(liquidityDelta),
          ),
        ];

        const setPositionOps = await sendBatch(
          tezos,
          setPositionParams as TransferParams[],
        );
        await confirmOperation(tezos, setPositionOps.opHash);

        //  -- Place a small swap to move the tick a little bit
        // -- and make sure `tick_cumulative` is not 0.
        tezos.setSignerProvider(swapper);

        await pool.swapYX(
          new BigNumber(100),
          new Date("2023-01-01").toString(),
          new BigNumber(0),
          await swapper.publicKeyHash(),
        );
        // -- Advance the time a few secs to make sure accumulators
        // -- like `seconds_per_liquidity_cumulative` change to non-zero values.
        await advanceSecs(2, [pool]);
        // -- Place a swap big enough to cross tick `ti2` and therefore
        // -- change the value of the `*_outside` fields to something other than zero.
        await pool.swapYX(
          new BigNumber(1_000),
          new Date("2023-01-01").toString(),
          new BigNumber(0),
          await swapper.publicKeyHash(),
        );
        const initialStorage = await pool.getStorage(
          genNatIds(2),
          [ti1, ti2, ti3, ti4, new Int(minTickIndex), new Int(maxTickIndex)],
          genNatIds(50),
        );
        const initialState = initialStorage.ticks.get(ti2);

        // -- Place a new position on `ti2` in order to update its state.
        tezos.setSignerProvider(liquidityProvider);
        pool.callSettings.setPosition = CallMode.returnConfirmatedOperation;
        await pool.setPosition(
          new BigNumber(ti2),
          new BigNumber(ti3),
          new BigNumber(minTickIndex),
          new BigNumber(minTickIndex),
          new BigNumber(liquidityDelta),
          new Date("2023-01-01").toString(),
          new BigNumber(liquidityDelta),
          new BigNumber(liquidityDelta),
        );

        // -- Check that `ti2`'s state has been updated.
        const finalStorage = await pool.getStorage(
          genNatIds(3),
          [ti1, ti2, ti3, ti4, new Int(minTickIndex), new Int(maxTickIndex)],
          genNatIds(50),
        );
        const finalState = finalStorage.ticks.get(ti2);

        expect(finalState.nPositions).to.deep.equal(
          initialState.nPositions.plus(1),
        );
        expect(finalState.liquidityNet).to.deep.equal(
          initialState.liquidityNet.plus(liquidityDelta),
        );
        expect(finalState.sqrtPrice).to.deep.equal(initialState.sqrtPrice);

        // -- Accumulators should stay unchanged.
        expect(finalState.feeGrowthOutside).to.deep.equal(
          initialState.feeGrowthOutside,
        );
        expect(finalState.secondsOutside).to.deep.equal(
          initialState.secondsOutside,
        );
        expect(finalState.secondsPerLiquidityOutside).to.deep.equal(
          initialState.secondsPerLiquidityOutside,
        );
        expect(finalState.tickCumulativeOutside).to.deep.equal(
          initialState.tickCumulativeOutside,
        );
      }
    });
    it("Should initializing correctly position", async () => {
      const liquidityProvider = aliceSigner;
      tezos.setSignerProvider(liquidityProvider);
      const swapper = bobSigner;
      const createPositionData = await genNonOverlappingPositions();

      const swapDirections = Array.from(
        { length: createPositionData.length },
        () => genSwapDirection(),
      );
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

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        tezos.setSignerProvider(liquidityProvider);
        const inSt = await pool.getRawStorage();
        const tokenTypeX = Object.keys(inSt.constants.token_x)[0];
        const tokenTypeY = Object.keys(inSt.constants.token_y)[0];
        const knownedTicks: Int[] = [
          new Int(minTickIndex),
          new Int(maxTickIndex),
        ];
        for (const [cpd, swapDirection] of createPositionData.map((cpd, i) => [
          cpd,
          swapDirections[i] === 0 ? "XtoY" : "YtoX",
        ])) {
          const lowerTickIndex = new Int(cpd.lowerTickIndex);
          const upperTickIndex = new Int(cpd.upperTickIndex);
          const liquidityDelta = cpd.liquidityDelta;
          const waitTime = cpd.waitTime;
          const swapAmount = new BigNumber(1_000);
          const swapAmountX = swapDirection === "XtoY" ? swapAmount : 0;
          const swapAmountY = swapDirection === "XtoY" ? 0 : swapAmount;

          // -- Place a position.

          tezos.setSignerProvider(liquidityProvider);
          // await pool.setPosition(
          //   new BigNumber(lowerTickIndex),
          //   new BigNumber(upperTickIndex),
          //   new BigNumber(minTickIndex),
          //   new BigNumber(minTickIndex),
          //   new BigNumber(liquidityDelta),
          //   new Date("2023-01-01").toString(),
          //   new BigNumber(liquidityDelta),
          //   new BigNumber(liquidityDelta),
          // );

          // -- Perform a swap to move the tick a bit.
          // -- This ensures the global accumulators (like fee_growth) aren't always 0.
          let initialBalanceX = await getTypedBalance(
            tezos,
            tokenTypeX,
            inSt.constants.token_x,
            pool.contract.address,
          );
          let initialBalanceY = await getTypedBalance(
            tezos,
            tokenTypeY,
            inSt.constants.token_y,
            pool.contract.address,
          );

          tezos.setSignerProvider(swapper);
          switch (swapDirection) {
            case "XtoY":
              const amt = initialBalanceX
                .div(2)
                .integerValue(BigNumber.ROUND_FLOOR);
              await pool.swapXY(
                amt,
                new Date("2023-01-01").toString(),
                new BigNumber(0),
                await swapper.publicKeyHash(),
              );
              break;
            default:
              const amt2 = initialBalanceY
                .div(2)
                .integerValue(BigNumber.ROUND_FLOOR);
              await pool.swapYX(
                amt2,
                new Date("2023-01-01").toString(),
                new BigNumber(0),
                await swapper.publicKeyHash(),
              );
          }
          knownedTicks.push(upperTickIndex);
          knownedTicks.push(lowerTickIndex);

          // -- Advance the time a few secs to make sure the buffer is updated to reflect the swaps.
          await advanceSecs(waitTime, [pool]);
          checkAllInvariants(
            pool,
            [liquidityProvider, swapper],
            genNatIds(50),
            knownedTicks,
            genNatIds(200),
          );

          const initSt = await pool.getStorage(
            genNatIds(50),
            knownedTicks,
            genNatIds(200),
          );
          initialBalanceX = await getTypedBalance(
            tezos,
            tokenTypeX,
            inSt.constants.token_x,
            pool.contract.address,
          );
          initialBalanceY = await getTypedBalance(
            tezos,
            tokenTypeY,
            inSt.constants.token_y,
            pool.contract.address,
          );

          tezos.setSignerProvider(liquidityProvider);

          await pool.setPosition(
            lowerTickIndex,
            upperTickIndex,
            new BigNumber(minTickIndex),
            new BigNumber(minTickIndex),
            new BigNumber(liquidityDelta),
            new Date("2023-01-01").toString(),
            new BigNumber(liquidityDelta),
            new BigNumber(liquidityDelta),
          );

          const finalSt = await pool.getStorage(
            genNatIds(50),
            knownedTicks,
            genNatIds(200),
          );

          // -- Ticks were initialized
          const initializedTickIndices = Object.keys(finalSt.ticks.map);
          expect(initializedTickIndices).to.include(lowerTickIndex.toString());
          expect(initializedTickIndices).to.include(upperTickIndex.toString());

          //  -- Ticks' states were correctly initialized.
          const lowerTick = finalSt.ticks.get(lowerTickIndex);
          const upperTick = finalSt.ticks.get(upperTickIndex);

          // -- `sqrtPriceFor` uses floating point math in Haskell, so we lose a lot of precision.
          // -- Therefore, we must accept a +/-1 margin of error.
          const lowerTickSqrtPrice = lowerTick.sqrtPrice;

          const lowerTickSqrtPriceForMinusOne = sqrtPriceForTick(
            lowerTickIndex.minus(1),
          );
          const lowerTickSqrtPriceForPlusOne = sqrtPriceForTick(
            lowerTickIndex.plus(1),
          );
          const lowerTickSqrtPrice_30 = adjustScale(
            lowerTickSqrtPrice,
            new Nat(80),
            new Nat(30),
          );
          ok(
            inRange(
              lowerTickSqrtPrice_30,
              adjustScale(
                lowerTickSqrtPriceForMinusOne,
                new Nat(80),
                new Nat(30),
              ),
              adjustScale(
                lowerTickSqrtPriceForPlusOne,
                new Nat(80),
                new Nat(30),
              ),
            ),
          );

          const upperTickSqrtPrice = upperTick.sqrtPrice;
          const upperTickSqrtPriceForMinusOne = sqrtPriceForTick(
            upperTickIndex.minus(1),
          );
          const upperTickSqrtPriceForPlusOne = sqrtPriceForTick(
            upperTickIndex.plus(1),
          );
          const upperTickSqrtPrice_30 = adjustScale(
            upperTickSqrtPrice,
            new Nat(80),
            new Nat(30),
          );
          ok(
            inRange(
              upperTickSqrtPrice_30,
              adjustScale(
                upperTickSqrtPriceForMinusOne,
                new Nat(80),
                new Nat(30),
              ),
              adjustScale(
                upperTickSqrtPriceForPlusOne,
                new Nat(80),
                new Nat(30),
              ),
            ),
          );

          expect(lowerTick.liquidityNet.toNumber()).to.be.eq(liquidityDelta);
          expect(upperTick.liquidityNet.toNumber()).to.be.eq(-liquidityDelta);

          expect(lowerTick.nPositions.toNumber()).to.be.eq(1);
          expect(upperTick.nPositions.toNumber()).to.be.eq(1);

          const {
            seconds: expectedSecondsOutside,
            tickCumulative: expectedTickCumulativeOutside,
            feeGrowth: expectedFeeGrowthOutside,
            secondsPerLiquidity: expectedSecondsPerLiquidityOutside,
          } = await initTickAccumulators(pool, finalSt, lowerTickIndex);

          // expect(lowerTick.secondsOutside).to.be.deep.equal(
          //   expectedSecondsOutside,
          // );
          ok(
            isInRangeNat(
              lowerTick.secondsOutside,
              expectedSecondsOutside,
              new BigNumber(1),
              new BigNumber(0),
            ),
          );

          expect(lowerTick.tickCumulativeOutside).to.be.deep.eq(
            expectedTickCumulativeOutside,
          );
          expect(lowerTick.feeGrowthOutside).to.be.deep.eq(
            expectedFeeGrowthOutside,
          );
          // expect(lowerTick.secondsPerLiquidityOutside).to.be.deep.eq(
          //   expectedSecondsPerLiquidityOutside,
          // );

          const {
            seconds: expectedSecondsOutside2,
            tickCumulative: expectedTickCumulativeOutside2,
            feeGrowth: expectedFeeGrowthOutside2,
            secondsPerLiquidity: expectedSecondsPerLiquidityOutside2,
          } = await initTickAccumulators(pool, finalSt, upperTickIndex);

          ok(
            isInRangeNat(
              upperTick.secondsOutside,
              expectedSecondsOutside2,
              new BigNumber(1),
              new BigNumber(0),
            ),
          );
          // expect(upperTick.secondsOutside).to.be.deep.eq(
          //   expectedSecondsOutside2,
          // );
          expect(upperTick.tickCumulativeOutside).to.be.deep.eq(
            expectedTickCumulativeOutside2,
          );
          expect(upperTick.feeGrowthOutside).to.be.deep.eq(
            expectedFeeGrowthOutside2,
          );
          expect(upperTick.secondsPerLiquidityOutside).to.be.deep.eq(
            expectedSecondsPerLiquidityOutside2,
          );

          //  -- Check global state updates
          const positionIsActive =
            lowerTickIndex.lte(finalSt.curTickIndex) &&
            finalSt.curTickIndex.lt(upperTickIndex);

          if (positionIsActive) {
            expect(finalSt.liquidity).to.be.deep.eq(
              initSt.liquidity.plus(liquidityDelta),
            );
          } else {
            expect(finalSt.liquidity).to.be.deep.eq(initSt.liquidity);
          }

          const positionId = initSt.newPositionId;
          expect(finalSt.newPositionId).to.be.deep.eq(positionId.plus(1));

          //  -- Check position's state
          const position = finalSt.positions.get(new Nat(positionId));
          expect(position.liquidity.toNumber()).to.be.eq(liquidityDelta);
          expect(position.owner).to.be.eq(
            await liquidityProvider.publicKeyHash(),
          );

          expect(position.lowerTickIndex).to.be.deep.eq(lowerTickIndex);
          expect(position.upperTickIndex).to.be.deep.eq(upperTickIndex);

          // expectedFeeGrowthInside <- tickAccumulatorsInside cfmm st lowerTickIndex upperTickIndex <&> aFeeGrowth

          const expectedFeeGrowthInside = await tickAccumulatorsInside(
            pool,
            finalSt,
            lowerTickIndex,
            upperTickIndex,
          ).then(a => a.aFeeGrowth);

          expect(
            position.feeGrowthInsideLast.x
              .plus(position.feeGrowthInsideLast.y)
              .toBignumber(),
          ).to.be.deep.eq(expectedFeeGrowthInside);

          //  -- Check FA2 transfers
          const xDelta = liquidityDeltaToTokensDelta(
            new Nat(liquidityDelta),
            lowerTickIndex,
            upperTickIndex,
            finalSt.curTickIndex,
            finalSt.sqrtPrice,
          ).x;

          const yDelta = liquidityDeltaToTokensDelta(
            new Nat(liquidityDelta),
            lowerTickIndex,
            upperTickIndex,
            finalSt.curTickIndex,
            finalSt.sqrtPrice,
          ).y;

          const finalBalanceX = await getTypedBalance(
            tezos,
            tokenTypeX,
            finalSt.constants.tokenX,
            pool.contract.address,
          );
          const finalBalanceY = await getTypedBalance(
            tezos,
            tokenTypeY,
            finalSt.constants.tokenY,
            pool.contract.address,
          );

          const exptectedFinalBalanceX = initialBalanceX
            .plus(xDelta)
            .isNegative()
            ? initialBalanceX.plus(xDelta).negated()
            : initialBalanceX.plus(xDelta);
          const exptectedFinalBalanceY = initialBalanceY

            .plus(yDelta)
            .isNegative()
            ? initialBalanceY.plus(yDelta).negated()
            : initialBalanceY.plus(yDelta);
          console.log(
            `finalBalanceX: ${finalBalanceX.toNumber()}, expectedFinalBalanceX: ${exptectedFinalBalanceX.toNumber()}`,
          );
          ok(
            isInRangeNat(
              finalBalanceX,
              exptectedFinalBalanceX,
              new BigNumber(0),
              new BigNumber(1),
            ),
          );

          ok(
            isInRangeNat(
              finalBalanceY,
              exptectedFinalBalanceY,
              new BigNumber(0),
              new BigNumber(1),
            ),
          );
        }
      }
    });
  });
});
