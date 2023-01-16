import { equal, rejects } from "assert";

import { MichelsonMap, TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { accounts } from "../sandbox/accounts";

import DexFactory from "./helpers/factoryFacade";
import env from "../env";
import { poolsFixture } from "./fixtures/poolFixture";
import { confirmOperation } from "../scripts/confirmation";
import { Int } from "@madfish/quipuswap-v3/dist/types";

const alice = accounts.alice;
const bob = accounts.bob;
const aliceSigner = new InMemorySigner(alice.sk);
const bobSigner = new InMemorySigner(bob.sk);

describe("Factory Tests", async function () {
  let tezos: TezosToolkit;
  let factory: DexFactory;

  let devFee: number = 0;
  before(async () => {
    tezos = new TezosToolkit(env.networks.development.rpc);
    tezos.setSignerProvider(aliceSigner);
    factory = await new DexFactory(tezos, "development").initialize(devFee);
  });
  describe("Failed cases", async () => {
    it("Shouldn't creating pool with too high fee bps", async function () {
      await rejects(
        factory.deployPool(
          alice.pkh,
          "fa12",
          alice.pkh,
          "fa12",
          10000,
          1,
          0,
          MichelsonMap.fromLiteral({}),
          0,
          0,
        ),
        (err: Error) => {
          equal(err.message.includes("402"), true);
          return true;
        },
      );
    });
    it("Shouldn't setting dev fee if not owner", async function () {
      tezos.setSignerProvider(bobSigner);
      await rejects(
        factory.contract.methods.set_dev_fee(1).send(),
        (err: Error) => {
          equal(err.message.includes("420"), true);
          return true;
        },
      );
    });
    it("Shouldn't creating existing pool", async function () {
      await factory.deployPool(
        alice.pkh,
        "fa12",
        alice.pkh,
        "fa12",
        1000,
        1,
        0,
        MichelsonMap.fromLiteral({}),
        0,
        0,
      );
      await rejects(
        factory.deployPool(
          alice.pkh,
          "fa12",
          alice.pkh,
          "fa12",
          1000,
          1,
          0,
          MichelsonMap.fromLiteral({}),
          0,
          0,
        ),
        (err: Error) => {
          equal(err.message.includes("403"), true);
          return true;
        },
      );
    });
  });
  describe("Success cases", async () => {
    it("Should setting dev fee", async function () {
      tezos.setSignerProvider(aliceSigner);
      const op = await factory.contract.methods.set_dev_fee(1).send();
      await confirmOperation(tezos, op.hash);
      const storage: any = await factory.contract.storage();
      equal(storage.dev_fee_bps.toNumber(), 1);
    });
    it("Should creating many pools", async function () {
      const { factory, poolFa12, poolFa2, poolFa1_2, poolFa2_1 } =
        await poolsFixture(tezos, [aliceSigner, bobSigner]);
      const storage: any = await factory.contract.storage();
      const poolFa12Storage: any = await poolFa12.contract.storage();
      const poolFa2Storage: any = await poolFa2.contract.storage();
      const poolFa1_2Storage: any = await poolFa1_2.contract.storage();
      const poolFa2_1Storage: any = await poolFa2_1.contract.storage();
      equal(storage.pool_count.toNumber(), 4);
      equal(await storage.pools.get("0"), poolFa12.contract.address);
      equal(await storage.pools.get("1"), poolFa2.contract.address);
      equal(await storage.pools.get("2"), poolFa1_2.contract.address);
      equal(await storage.pools.get("3"), poolFa2_1.contract.address);
      equal(
        await storage.pool_ids.get({
          fee_bps: poolFa12Storage.constants.fee_bps.toFixed(),
          token_x: poolFa12Storage.constants.token_x,
          token_y: poolFa12Storage.constants.token_y,
        }),
        "0",
      );
      equal(
        await storage.pool_ids.get({
          fee_bps: poolFa2Storage.constants.fee_bps.toFixed(),
          token_x: poolFa2Storage.constants.token_x,
          token_y: poolFa2Storage.constants.token_y,
        }),
        "1",
      );
      equal(
        await storage.pool_ids.get({
          fee_bps: poolFa1_2Storage.constants.fee_bps.toFixed(),
          token_x: poolFa1_2Storage.constants.token_x,
          token_y: poolFa1_2Storage.constants.token_y,
        }),
        "2",
      );
      equal(
        await storage.pool_ids.get({
          fee_bps: poolFa2_1Storage.constants.fee_bps.toFixed(),
          token_x: poolFa2_1Storage.constants.token_x,
          token_y: poolFa2_1Storage.constants.token_y,
        }),
        "3",
      );
    });
  });
});
