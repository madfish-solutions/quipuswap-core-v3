import { deepEqual, equal, rejects, strictEqual } from "assert";

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

const alice = accounts.alice;
const bob = accounts.bob;
const carol = accounts.carol;
const eve = accounts.eve;
const aliceSigner = new InMemorySigner(alice.sk);
const bobSigner = new InMemorySigner(bob.sk);
const carolSigner = new InMemorySigner(carol.sk);

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

    const operation = await tezos.contract.transfer({
      to: carol.pkh,
      amount: 1e6,
      mutez: true,
    });

    await confirmOperation(tezos, operation.hash);
  });
  describe("Failed cases", async () => {
    it("Shouldn't setting position with lower_tick=upper_tick", async () => {
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
      const prevLiquidity = (await poolFa12.getStorage()).liquidity;
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
      const actualLiquidity = (await poolFa12.getStorage()).liquidity;
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
        const pstorage = await pool.getStorage();
        //console.log(pstorage.new_position_id);
        const storage = await pool.getStorage();
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
        const storage = await pool.getStorage();
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
        const initialSt = await pool.getStorage();
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
    it("Should adding liquidity twice is the same as adding it once", async () => {
      tezos.setSignerProvider(aliceSigner);
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        const initialSt = await pool.getStorage();
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
        const initialSt = await pool.getStorage();
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
        const initialSt = await pool.getStorage();
        const tokenType = Object.keys(initialSt.constants.token_x)[0];
        const prevEveBalanceX = await getTypedBalance(
          tezos,
          tokenType,
          initialSt.constants.token_x,
          eve.pkh,
        );
        const prevEveBalanceY = await getTypedBalance(
          tezos,
          tokenType,
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
          const initialSt = await pool.getStorage();
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
          const storage = await pool.getStorage();
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
        const st = await pool.getStorage();

        await collectFees(pool, eve.pkh, [initialSt.new_position_id]);
        const eveBalanceX = (
          await getTypedBalance(
            tezos,
            tokenType,
            initialSt.constants.token_x,
            eve.pkh,
          )
        ).minus(prevEveBalanceX);
        const eveBalanceY = (
          await getTypedBalance(
            tezos,
            tokenType,
            initialSt.constants.token_y,
            eve.pkh,
          )
        ).minus(prevEveBalanceY);
        console.log("eveBalanceX", eveBalanceX.toFixed());
        console.log("eveBalanceY", eveBalanceY.toFixed());
        console.log("xFees", xFees.toFixed());
        console.log();
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
        strictEqual(
          shiftRight(xFees, new BigNumber(128))
            .integerValue(BigNumber.ROUND_FLOOR)
            .toFixed(),
          "0",
        );
        strictEqual(
          shiftRight(yFees, new BigNumber(128))
            .integerValue(BigNumber.ROUND_FLOOR)
            .toFixed(),
          "0",
        );
      }
    });
  });
});
