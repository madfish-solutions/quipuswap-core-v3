import {
  deepEqual,
  deepStrictEqual,
  equal,
  rejects,
  strictEqual,
} from "assert";
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
import {
  sendBatch,
  Timestamp,
  initTimedCumulatives,
  initTimedCumulativesBuffer,
} from "@madfish/quipuswap-v3/dist/utils";
import { MichelsonMapKey } from "@taquito/michelson-encoder";
import {
  checkAccumulatorsInvariants,
  checkAllInvariants,
} from "./helpers/invariants";
import { Int, Nat, quipuswapV3Types } from "@madfish/quipuswap-v3/dist/types";

const alice = accounts.alice;
const bob = accounts.bob;
const carol = accounts.carol;
const eve = accounts.eve;
const aliceSigner = new InMemorySigner(alice.sk);
const bobSigner = new InMemorySigner(bob.sk);
const carolSigner = new InMemorySigner(carol.sk);
const eveSigner = new InMemorySigner(eve.sk);

const minTickIndex = -1048575;
const maxTickIndex = 1048575;
const tickSpacing = 1;

const cumulativesBuffer1 = async (now: string) => {
  const initVal = await initTimedCumulativesBuffer(new Nat(0));
  initVal.first = new Nat(1);
  initVal.last = new Nat(1);
  initVal.map.michelsonMap = new MichelsonMap();
  initVal.map.michelsonMap.set(1, initTimedCumulatives(now));
  return initVal;
};

const genFees = (feeCount: number, zeroFee: boolean = false) => {
  const fees: number[] = [];
  for (let i = 0; i < feeCount; i++) {
    fees.push(zeroFee ? 0 : Math.floor(Math.random() * 1e4));
  }
  return fees;
};

const genNatIds = maxId => {
  const ids: Nat[] = [];
  for (let i = 0; i < maxId; i++) {
    ids.push(new Nat(i));
  }
  return ids;
};
const compareStorages = (
  storage1: quipuswapV3Types.Storage,
  storage2: quipuswapV3Types.Storage,
) => {
  expect(storage1.newPositionId).to.be.deep.equal(storage2.newPositionId);
  expect(storage1.constants).to.be.deep.equal(storage2.constants);
  expect(storage1.sqrtPrice).to.be.deep.equal(storage2.sqrtPrice);
  expect(storage1.curTickIndex).to.be.deep.equal(storage2.curTickIndex);
  expect(storage1.curTickWitness).to.be.deep.equal(storage2.curTickWitness);
  expect(storage1.feeGrowth).to.be.deep.equal(storage2.feeGrowth);
  expect(storage1.ticks.map).to.be.deep.equal(storage2.ticks.map);

  expect(storage1.positions.map).to.be.deep.equal(storage2.positions.map);
  expect(storage1.liquidity).to.be.deep.equal(storage2.liquidity);

  expect(storage1.cumulativesBuffer.map.map).to.be.deep.equal(
    storage2.cumulativesBuffer.map.map,
  );
  console.log(
    storage1.cumulativesBuffer.first.toFixed(),
    storage2.cumulativesBuffer.first.toFixed(),
  );
  // expect(storage1.cumulativesBuffer.first).to.be.deep.equal(
  //   storage2.cumulativesBuffer.first,
  // );
  // expect(storage1.cumulativesBuffer.last).to.be.deep.equal(
  //   storage2.cumulativesBuffer.last,
  // );
  expect(storage1.cumulativesBuffer.reservedLength).to.be.deep.equal(
    storage2.cumulativesBuffer.reservedLength,
  );
};

const calcFee = (
  feeBps: BigNumber,
  tokensDelta: BigNumber,
  liquidity: BigNumber,
) => {
  const fee = tokensDelta
    .multipliedBy(feeBps)
    .dividedBy(10000)
    .integerValue(BigNumber.ROUND_CEIL);

  return shiftLeft(fee, new BigNumber(128))
    .dividedBy(liquidity)
    .integerValue(BigNumber.ROUND_FLOOR);
};

/** A bitwise shift left operation

 */
const shiftLeft = (x: BigNumber, y: BigNumber) => {
  return x.multipliedBy(new BigNumber(2).pow(y));
};

/**
 * A bitwise shift right operation
 */
const shiftRight = (x: BigNumber, y: BigNumber) => {
  return x.dividedBy(new BigNumber(2).pow(y));
};

const getTypedBalance = async (
  tezos: TezosToolkit,
  tokenType: string,
  token: any,
  address: string,
) => {
  if (tokenType === "fa12") {
    const fa12 = new FA12(await tezos.contract.at(token["fa12"]), tezos);
    const balance = await fa12.getBalance(address);
    return new BigNumber(balance);
  } else {
    const fa2 = new FA2(
      await tezos.contract.at(token["fa2"].token_address),
      tezos,
    );
    const balance = await fa2.getBalance(address);
    return new BigNumber(balance);
  }
};

const collectFees = async (
  pool: QuipuswapV3,
  recipient: string,
  posIds: BigNumber[],
) => {
  for (const posId of posIds) {
    try {
      await pool.updatePosition(
        posId,
        new BigNumber(0),
        recipient,
        recipient,
        new Date("2023-01-01T00:00:00Z").toString(),
        new BigNumber(0),
        new BigNumber(0),
      );
    } catch (e) {}
  }
};

//a function that finds all ticks from pool.storage.ticks using the previous and next tick from the first found tickstate
// const findTicks = async(
//   pool: QuipuswapV3,

//   tickIndex: number,
//   tickSpacing: number,
//   minTickIndex: number,
//   maxTickIndex: number,
// ): Promise<quipuswapV3Types.Tick[]> => {
//   const ticks: quipuswapV3Types.Tick[] = [];
//   let tick = await pool.getTick(tickIndex);
//   ticks.push(tick);
//   let nextTickIndex = tick.next;
//   let prevTickIndex = tick.prev;
//   while (nextTickIndex !== maxTickIndex) {
//     tick = await pool.getTick(nextTickIndex);
//     ticks.push(tick);
//     nextTickIndex = tick.next;
//   }
//   while (prevTickIndex !== minTickIndex) {
//     tick = await pool.getTick(prevTickIndex);
//     ticks.push(tick);
//     prevTickIndex = tick.prev;
//   }
//   return ticks;
// };

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
      to: carol.pkh,
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
    it("Shouldn't setting position with lower_tick=upper_tick", async () => {
      const initUSDtz = await poolFa12.observe([
        Math.floor(Date.now() / 1000 + 1).toString(),
      ]);

      console.log(initUSDtz);
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
    it("Shouldn't setting a position with lower_tick>upper_tick", async () => {
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
    it("Shouldn't setting a position with zero liquidity is a no-op", async () => {
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
    it("Shouldn't setting a position with wrong ticket witness", async () => {
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
    it("Shouldn't setting a position with past the deadline", async () => {
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
    it("Shouldn't setting a position if a tick index is not a multiple of 'tick_spacing'", async () => {
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
    it("Shouldn't setting a position if upper_tick > max_tick, for all tokens combinations", async () => {
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

    it("Shouldn't transfer more than maximum_tokens_contributed for all token combinations", async () => {
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
    it("Shouldn't withdrawing more liquidity from a position than it currently has", async () => {
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
    it("Shouldn't updating a non-existing position properly fails", async () => {
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
    it("Should depositing and withdrawing the same amount of liquidity", async () => {
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

        console.log(
          "XYBalances, should be 0",
          xBalance.toFixed(),
          yBalance.toFixed(),
        );

        // The contract's balance should be 0.
        // There is a margin of error, so the contract may end up with at most 1 token.
        expect(xBalance.toNumber()).to.be.closeTo(0, 1);
        expect(yBalance.toNumber()).to.be.closeTo(0, 1);

        equal(
          poolStorage.new_position_id.toNumber(),
          initialSt.new_position_id.toNumber() + 1,
        );
        //checkCompares xBalance elem [0, 1] from Haskell
      }
    });
    it("Should adding liquidity twice is the same as adding it once", async () => {
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
        console.log("dsadasdasdasdas");
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
    it("Should be lowest and highest ticks cannot be garbage collected", async () => {
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
          [new Nat(0), new Nat(1), new Nat(2), new Nat(3)],
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
        await sleep(5000);
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
          [new Nat(0), new Nat(1), new Nat(2)],
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
        //compareStorages(initialSt, poolStorage);
      }
    });
    it("Should allow Liquidity Providers earning fees from swaps", async () => {
      const fees = genFees(4);
      const swappers = [bobSigner, carolSigner];
      console.log(1111);
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
        [aliceSigner, bobSigner, carolSigner],
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
      console.log(22221111);
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
          const xFee = calcFee(feeBps, transferAmount, storage.liquidity);
          const yFee = calcFee(feeBps, transferAmount, storage.liquidity);

          strictEqual(
            xFeeBalance.minus(prevXFeeBalance).toFixed(),
            xFee.toFixed(),
          );
          strictEqual(
            yFeeBalance.minus(prevYFeeBalance).toFixed(),
            yFee.toFixed(),
          );
          xFees = xFees.plus(xFee);
          yFees = yFees.plus(yFee);

          // strictEqual(
          //   shiftRight(xFeeBalance.minus(prevXFeeBalance), new BigNumber(128))
          //     .integerValue(BigNumber.ROUND_FLOOR)
          //     .toFixed(),
          //   "0",
          // );
          // strictEqual(
          //   shiftRight(yFeeBalance.minus(prevYFeeBalance), new BigNumber(128))
          //     .integerValue(BigNumber.ROUND_FLOOR)
          //     .toFixed(),
          //   "0",
          // );
        }
        tezos.setSignerProvider(aliceSigner);
        const st = await pool.getRawStorage();
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

        const shiftedX = shiftRight(xFees, new BigNumber(128))
          .multipliedBy(st.liquidity)
          .integerValue(BigNumber.ROUND_FLOOR);
        const shiftedY = shiftRight(yFees, new BigNumber(128))
          .multipliedBy(st.liquidity)
          .integerValue(BigNumber.ROUND_FLOOR);
        console.log("Eve Real Balance: ", eveBalanceX.toFixed());
        console.log(
          "Shifted xFees * liq : ",
          shiftRight(xFees, new BigNumber(128))
            .multipliedBy(st.liquidity)
            .integerValue(BigNumber.ROUND_FLOOR)
            .toFixed(),
        );
        console.log(xFees);
        equal(
          eveBalanceX.toFixed() ==
            shiftRight(xFees, new BigNumber(128))
              .multipliedBy(st.liquidity)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed() ||
            eveBalanceX.toFixed() ==
              shiftRight(xFees, new BigNumber(128))
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .plus(1)
                .toFixed() ||
            eveBalanceX.toFixed() ==
              shiftRight(xFees, new BigNumber(128))
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .minus(1)
                .toFixed(),
          true,
        );

        equal(
          eveBalanceY.toFixed() ==
            shiftRight(yFees, new BigNumber(128))
              .multipliedBy(st.liquidity)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed() ||
            eveBalanceY.toFixed() ==
              shiftRight(yFees, new BigNumber(128))
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_UP)
                .minus(1)
                .toFixed() ||
            eveBalanceY.toFixed() ==
              shiftRight(yFees, new BigNumber(128))
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_UP)
                .plus(1)
                .toFixed(),
          true,
        );
        console.log("xFees", xFees.toFixed());
        console.log(
          "ShiftRighted xFees:",
          shiftRight(xFees, new BigNumber(128)).toNumber(),
        );
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
    it("Should allow Liquidity Providers earning fees proportional to their liquidity", async () => {
      const fees = [
        Math.floor(Math.random() * 1e4),
        Math.floor(Math.random() * 1e4),
        Math.floor(Math.random() * 1e4),
        Math.floor(Math.random() * 1e4),
      ];
      const swappers = [bobSigner, carolSigner];

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
        [aliceSigner, bobSigner, carolSigner, eveSigner],
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
          const xFee = calcFee(feeBps, transferAmount, storage.liquidity);
          const yFee = calcFee(feeBps, transferAmount, storage.liquidity);
          xFees = xFees.plus(xFee);
          yFees = yFees.plus(yFee);

          strictEqual(
            xFeeBalance.minus(prevXFeeBalance).toFixed(),
            xFee.toFixed(),
          );
          strictEqual(
            yFeeBalance.minus(prevYFeeBalance).toFixed(),
            yFee.toFixed(),
          );
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
        console.log(
          eveBalanceX.toFixed(),
          shiftRight(xFees, new BigNumber(128))
            .dividedBy(4)
            .multipliedBy(st.liquidity)
            .integerValue(BigNumber.ROUND_FLOOR)
            .toFixed(),
        );
        equal(
          eveBalanceX.toFixed() ==
            shiftRight(xFees, new BigNumber(128))
              .dividedBy(4)
              .multipliedBy(st.liquidity)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed() ||
            eveBalanceX.toFixed() ==
              shiftRight(xFees, new BigNumber(128))
                .dividedBy(4)
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .plus(1)
                .toFixed() ||
            eveBalanceX.toFixed() ==
              shiftRight(xFees, new BigNumber(128))
                .dividedBy(4)
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .minus(1)
                .toFixed(),
          true,
        );

        equal(
          eveBalanceY.toFixed() ==
            shiftRight(xFees, new BigNumber(128))
              .dividedBy(4)
              .multipliedBy(st.liquidity)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed() ||
            eveBalanceY.toFixed() ==
              shiftRight(xFees, new BigNumber(128))
                .dividedBy(4)
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .plus(1)
                .toFixed() ||
            eveBalanceY.toFixed() ==
              shiftRight(xFees, new BigNumber(128))
                .dividedBy(4)
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .minus(1)
                .toFixed(),
          true,
        );

        equal(
          aliceBalanceX.toFixed() ==
            shiftRight(xFees.multipliedBy(3), new BigNumber(128))
              .dividedBy(4)
              .multipliedBy(st.liquidity)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed() ||
            aliceBalanceX.toFixed() ==
              shiftRight(xFees.multipliedBy(3), new BigNumber(128))
                .dividedBy(4)
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .plus(1)
                .toFixed() ||
            aliceBalanceX.toFixed() ==
              shiftRight(xFees.multipliedBy(3), new BigNumber(128))
                .dividedBy(4)
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .minus(1)
                .toFixed(),
          true,
        );
        equal(
          aliceBalanceY.toFixed() ==
            shiftRight(yFees.multipliedBy(3), new BigNumber(128))
              .dividedBy(4)
              .multipliedBy(st.liquidity)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed() ||
            aliceBalanceY.toFixed() ==
              shiftRight(yFees.multipliedBy(3), new BigNumber(128))
                .dividedBy(4)
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .plus(1)
                .toFixed() ||
            aliceBalanceY.toFixed() ==
              shiftRight(yFees.multipliedBy(3), new BigNumber(128))
                .dividedBy(4)
                .multipliedBy(st.liquidity)
                .integerValue(BigNumber.ROUND_FLOOR)
                .minus(1)
                .toFixed(),
          true,
        );

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
    // it("Should allow accrued fees are discounted when adding liquidity to an existing position", async () => {
    //   const fees = [
    //     Math.floor(Math.random() * 1e4),
    //     Math.floor(Math.random() * 1e4),
    //     Math.floor(Math.random() * 1e4),
    //     Math.floor(Math.random() * 1e4),
    //   ];
    //   const swappers = [bobSigner, carolSigner];

    //   const {
    //     factory: _factory,
    //     fa12TokenX: _fa12TokenX,
    //     fa12TokenY: _fa12TokenY,
    //     fa2TokenX: _fa2TokenX,
    //     fa2TokenY: _fa2TokenY,
    //     poolFa12: _poolFa12,
    //     poolFa2: _poolFa2,
    //     poolFa1_2: _poolFa1_2,
    //     poolFa2_1: _poolFa2_1,
    //   } = await poolsFixture(
    //     tezos,
    //     [aliceSigner, bobSigner, carolSigner, eveSigner],
    //     fees,
    //   );
    //   factory = _factory;
    //   fa12TokenX = _fa12TokenX;
    //   fa12TokenY = _fa12TokenY;
    //   fa2TokenX = _fa2TokenX;
    //   fa2TokenY = _fa2TokenY;
    //   poolFa12 = _poolFa12;
    //   poolFa2 = _poolFa2;
    //   poolFa1_2 = _poolFa1_2;
    //   poolFa2_1 = _poolFa2_1;
    //   for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
    //     const transferAmount = new BigNumber(Math.floor(Math.random() * 1e4));
    //     const initialSt = await pool.getRawStorage();
    //     const tokenTypeX = Object.keys(initialSt.constants.token_x)[0];
    //     const tokenTypeY = Object.keys(initialSt.constants.token_y)[0];

    //     tezos.setSignerProvider(aliceSigner);
    //     await pool.setPosition(
    //       new BigNumber(-10000),
    //       new BigNumber(10000),
    //       new BigNumber(minTickIndex),
    //       new BigNumber(minTickIndex),
    //       new BigNumber(1e7 * 3),
    //       new Date("2023-01-01").toString(),
    //       new BigNumber(1e7 * 3),
    //       new BigNumber(1e7 * 3),
    //     );
    //     const prevEveBalanceX = await getTypedBalance(
    //       tezos,
    //       tokenTypeX,
    //       initialSt.constants.token_x,
    //       eve.pkh,
    //     );
    //     const prevEveBalanceY = await getTypedBalance(
    //       tezos,
    //       tokenTypeY,
    //       initialSt.constants.token_y,
    //       eve.pkh,
    //     );
    //     const prevAliceBalanceX = await getTypedBalance(
    //       tezos,
    //       tokenTypeX,
    //       initialSt.constants.token_x,
    //       alice.pkh,
    //     );
    //     const prevAliceBalanceY = await getTypedBalance(
    //       tezos,
    //       tokenTypeY,
    //       initialSt.constants.token_y,
    //       alice.pkh,
    //     );
    //     let xFees: BigNumber = new BigNumber(0);
    //     let yFees: BigNumber = new BigNumber(0);
    //     for (const swapper of swappers) {
    //       const initialSt = await pool.getRawStorage();
    //       const feeBps = initialSt.constants.fee_bps;
    //       const prevXFeeBalance = initialSt.fee_growth.x;
    //       const prevYFeeBalance = initialSt.fee_growth.y;

    //       tezos.setSignerProvider(swapper);
    //       const swapperAddr = await swapper.publicKeyHash();

    //       await pool.swapXY(
    //         transferAmount,
    //         new Date("2023-01-01").toString(),
    //         new BigNumber(1),
    //         swapperAddr,
    //       );
    //       await pool.swapYX(
    //         transferAmount,
    //         new Date("2023-01-01").toString(),
    //         new BigNumber(1),
    //         swapperAddr,
    //       );
    //       const storage = await pool.getRawStorage();
    //       const xFeeBalance = storage.fee_growth.x;
    //       const yFeeBalance = storage.fee_growth.y;
    //       const xFee = calcFee(feeBps, transferAmount, storage.liquidity);
    //       const yFee = calcFee(feeBps, transferAmount, storage.liquidity);
    //       xFees = xFees.plus(xFee);
    //       yFees = yFees.plus(yFee);

    //       strictEqual(
    //         xFeeBalance.minus(prevXFeeBalance).toFixed(),
    //         xFee.toFixed(),
    //       );
    //       strictEqual(
    //         yFeeBalance.minus(prevYFeeBalance).toFixed(),
    //         yFee.toFixed(),
    //       );
    //       strictEqual(
    //         shiftRight(xFeeBalance.minus(prevXFeeBalance), new BigNumber(128))
    //           .integerValue(BigNumber.ROUND_FLOOR)
    //           .toFixed(),
    //         "0",
    //       );
    //       strictEqual(
    //         shiftRight(yFeeBalance.minus(prevYFeeBalance), new BigNumber(128))
    //           .integerValue(BigNumber.ROUND_FLOOR)
    //           .toFixed(),
    //         "0",
    //       );
    //     }
    //     await collectFees(pool, alice.pkh, [0]);
    //     /**
    //      * (initialBalanceLpX, initialBalanceLpY) <- balancesOf balanceConsumers liquidityProvider

    //   withSender liquidityProvider $ updatePosition cfmm feeReceiver (toInteger liquidityDelta) 0

    //   ( (finalBalanceLpX, finalBalanceFeeReceiverX),
    //     (finalBalanceLpY, finalBalanceFeeReceiverY))
    //     <- balancesOfMany balanceConsumers (liquidityProvider, feeReceiver)

    //   -- The fees earned during the swaps should be discounted from the
    //   -- tokens needed to make the deposit.
    //   -- Due to rounding, it's possible the LP will receive 1 fewer tokens than expected.
    //   st <- getStorage cfmm
    //   let PerToken xDelta yDelta = liquidityDeltaToTokensDelta (fromIntegral liquidityDelta) lowerTickIndex upperTickIndex (sCurTickIndexRPC st) (sSqrtPriceRPC st)
    //   -- Note: Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable.
    //   -- Due to the floating-point math used in `liquidityDeltaToTokensDelta`, it's possible there
    //   -- will be an additional +/- 1 error.
    //   finalBalanceLpX `isInRangeNat` (initialBalanceLpX + xFees - fromIntegral @Integer @Natural xDelta) $ (2, 1)
    //   finalBalanceLpY `isInRangeNat` (initialBalanceLpY + yFees - fromIntegral @Integer @Natural yDelta) $ (2, 1)

    //   -- `feeReceiver` should not receive any fees.
    //   finalBalanceFeeReceiverX @== 0
    //   finalBalanceFeeReceiverY @== 0

    //      */
    //     const finalEveBalanceX = await getTypedBalance(
    //       tezos,
    //       tokenTypeX,
    //       initialSt.constants.token_x,
    //       eve.pkh,
    //     );
    //     const finalEveBalanceY = await getTypedBalance(
    //       tezos,
    //       tokenTypeY,

    //       initialSt.constants.token_y,
    //       eve.pkh,
    //     );
    //     const finalAliceBalanceX = await getTypedBalance(
    //       tezos,
    //       tokenTypeX,
    //       initialSt.constants.token_x,
    //       alice.pkh,
    //     );
    //     const finalAliceBalanceY = await getTypedBalance(
    //       tezos,
    //       tokenTypeY,
    //       initialSt.constants.token_y,
    //       alice.pkh,
    //     );
    //     const finalLpBalanceX = await getTypedBalance(
    //       tezos,
    //       tokenTypeX,
    //       initialSt.constants.token_x,
    //       pool.contract.address,
    //     );
    //     const finalLpBalanceY = await getTypedBalance(
    //       tezos,
    //       tokenTypeY,
    //       initialSt.constants.token_y,
    //       pool.contract.address,
    //     );
    //     const finalFeeReceiverBalanceX = await getTypedBalance(
    //       tezos,
    //       tokenTypeX,
    //       initialSt.constants.token_x,
    //       feeReceiver.pkh,
    //     );
    //     const finalFeeReceiverBalanceY = await getTypedBalance(
    //       tezos,
    //       tokenTypeY,
    //       initialSt.constants.token_y,
    //       feeReceiver.pkh,
    //     );
    //   }
    // });
  });
});
