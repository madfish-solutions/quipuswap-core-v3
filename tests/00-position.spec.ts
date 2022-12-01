import { deepEqual, equal, rejects, strictEqual } from "assert";
import { expect } from "chai";
import { BigNumber } from "bignumber.js";

import { MichelsonMap, TezosToolkit, TransferParams } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { accounts } from "../sandbox/accounts";
import { QuipuswapV3 } from "@madfish/quipuswap-v3";
import DexFactory from "./helpers/factoryFacade";
import env from "../env";
import { FA2 } from "./helpers/FA2";
import { FA12 } from "./helpers/FA12";
import { poolsFixture } from "./fixtures/poolFixture";
import { confirmOperation } from "../scripts/confirmation";
import { Timestamp } from "@madfish/quipuswap-v3/dist/utils";
import { MichelsonMapKey } from "@taquito/michelson-encoder";
import {
  checkAccumulatorsInvariants,
  checkAllInvariants,
} from "./helpers/invariants";
import { Int, Nat } from "@madfish/quipuswap-v3/dist/types";

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

describe("Position Tests", async () => {
  let pool: QuipuswapV3;
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
      const st = await poolFa12.getRawStorage();
      console.log(st.sqrt_price);
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
      for (pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
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
      for (pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
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
        const pstorage = await pool.getRawStorage();
        //console.log(pstorage.new_position_id);
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
        await pool.updatePosition(
          storage.new_position_id,
          new BigNumber(-1e7),
          alice.pkh,
          alice.pkh,
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
      }
    });
    it("Shouldn't withdrawing more liquidity from a position than it currently has", async () => {
      for (pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
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
      for (pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
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
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const initialSt = await pool.getRawStorage();

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
        console.log(poolStorage.sqrt_price.toFixed());

        let xBalance;
        let yBalance;

        if ("fa12" in poolStorage.constants.token_x) {
          xBalance = await fa12TokenX.getBalance(pool.contract.address);
        } else {
          xBalance = await fa2TokenX.getBalance(
            pool.contract.address,
            new BigNumber(0),
          );
        }
        if ("fa12" in poolStorage.constants.token_y) {
          yBalance = await fa12TokenY.getBalance(pool.contract.address);
        } else {
          yBalance = await fa2TokenY.getBalance(
            pool.contract.address,
            new BigNumber(0),
          );
        }

        console.log(312321321312321312, xBalance.toFixed(), yBalance.toFixed());

        // equal(xBalance.toNumber(), 0);
        // equal(yBalance.toNumber(), 0);
        equal(
          poolStorage.new_position_id.toNumber(),
          initialSt.new_position_id.toNumber() + 1,
        );
      }
    });
    it("Should adding liquidity twice is the same as adding it once", async () => {
      tezos.setSignerProvider(aliceSigner);
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const initialSt = await pool.getRawStorage();
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
          new BigNumber(1e7),
          alice.pkh,
          alice.pkh,
          new Date("2023-01-01").toString(),
          new BigNumber(1e7),
          new BigNumber(1e7),
        );
        const poolStorage = (await pool.contract.storage()) as any;

        let xBalance;
        let yBalance;

        if ("fa12" in poolStorage.constants.token_x) {
          xBalance = await fa12TokenX.getBalance(
            poolStorage.constants.token_x["fa12"].token_address,
          );
        } else {
          xBalance = await fa2TokenX.getBalance(
            poolStorage.constants.token_x["fa2"].token_address,
            new BigNumber(0),
          );
        }
        if ("fa12" in poolStorage.constants.token_y) {
          yBalance = await fa12TokenY.getBalance(
            poolStorage.constants.token_y["fa12"].token_address,
          );
        } else {
          yBalance = await fa2TokenY.getBalance(
            poolStorage.constants.token_y["fa2"].token_address,
            new BigNumber(0),
          );
        }

        equal(xBalance.toNumber(), 0);
        equal(yBalance.toNumber(), 0);
        equal(
          poolStorage.new_position_id.toNumber(),
          initialSt.new_position_id.toNumber() + 1,
        );
      }
    });
    it("Should be lowest and highest ticks cannot be garbage collected", async () => {
      tezos.setSignerProvider(aliceSigner);
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const initialSt = await pool.getRawStorage();
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
        const now =
          Date.parse((await tezos.rpc.getBlockHeader()).timestamp) / 1000;
        await pool.updatePosition(
          initialSt.new_position_id,
          new BigNumber(-1),
          alice.pkh,
          alice.pkh,
          new Date("2023-01-01").toString(),
          new BigNumber(1),
          new BigNumber(1),
        );
        const poolStorage = (await pool.contract.storage()) as any;

        let xBalance;
        let yBalance;

        if ("fa12" in poolStorage.constants.token_x) {
          xBalance = await fa12TokenX.getBalance(
            poolStorage.constants.token_x["fa12"].token_address,
          );
        } else {
          xBalance = await fa2TokenX.getBalance(
            poolStorage.constants.token_x["fa2"].token_address,
            new BigNumber(0),
          );
        }
        if ("fa12" in poolStorage.constants.token_y) {
          yBalance = await fa12TokenY.getBalance(
            poolStorage.constants.token_y["fa12"].token_address,
          );
        } else {
          yBalance = await fa2TokenY.getBalance(
            poolStorage.constants.token_y["fa2"].token_address,
            new BigNumber(0),
          );
        }

        equal(xBalance.toNumber(), 0);
        equal(yBalance.toNumber(), 0);
        equal(
          poolStorage.new_position_id.toNumber(),
          initialSt.new_position_id.toNumber() + 1,
        );
      }
    });
    it("Should allow Liquidity Providers earning fees from swaps", async () => {
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

      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        tezos.setSignerProvider(aliceSigner);

        const transferAmount = new BigNumber(Math.floor(Math.random() * 1e4));
        const initialSt = await pool.getRawStorage();
        console.log(initialSt.sqrt_price.toFixed());
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
          console.log("SQRT", storage.sqrt_price.toFixed());
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
          strictEqual(
            shiftRight(xFeeBalance.minus(prevXFeeBalance), new BigNumber(128))
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed(),
            "0",
          );
          strictEqual(
            shiftRight(yFeeBalance.minus(prevYFeeBalance), new BigNumber(128))
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed(),
            "0",
          );
        }
        tezos.setSignerProvider(aliceSigner);
        const st = await pool.getRawStorage();

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
          strictEqual(
            shiftRight(xFeeBalance.minus(prevXFeeBalance), new BigNumber(128))
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed(),
            "0",
          );
          strictEqual(
            shiftRight(yFeeBalance.minus(prevYFeeBalance), new BigNumber(128))
              .integerValue(BigNumber.ROUND_FLOOR)
              .toFixed(),
            "0",
          );
        }

        const st = await pool.getRawStorage();
        const poolSt = await pool.getStorage();
        const upperTi = new Int(10000);
        const lowerTi = new Int(-10000);
        await checkAllInvariants(
          pool,
          poolSt,
          [new Nat(0), new Nat(1)],
          [lowerTi, upperTi],
          { [alice.pkh]: aliceSigner, [eve.pkh]: eveSigner },
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
