import { equal, notEqual, ok, rejects } from "assert";

import { BigNumber } from "bignumber.js";

import { TezosToolkit, TransferParams } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { accounts } from "../sandbox/accounts";
import { QuipuswapV3 } from "@madfish/quipuswap-v3";

import DexFactory from "./helpers/factoryFacade";
import env from "../env";
import { FA2 } from "./helpers/FA2";
import { FA12 } from "./helpers/FA12";
import { poolsFixture } from "./fixtures/poolFixture";
import { confirmOperation } from "../scripts/confirmation";
import { Int, Nat } from "@madfish/quipuswap-v3/dist/types";
import { validDeadline } from "./helpers/utils";

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

describe("FA2 Tests", async function () {
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
    tezos.setSignerProvider(aliceSigner);
    for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
      await pool.setPosition(
        new Int(-1000),
        new Int(1000),
        minTickIndex,
        minTickIndex,
        new BigNumber(1e7),
        validDeadline(),
        new BigNumber(1e7),
        new BigNumber(1e7),
      );

      await pool.setPosition(
        new Int(1000),
        new Int(2000),
        minTickIndex,
        minTickIndex,
        new BigNumber(1e7),
        validDeadline(),
        new BigNumber(1e7),
        new BigNumber(1e7),
      );
      const operation = await tezos.contract.transfer({
        to: eve.pkh,
        amount: 1e6,
        mutez: true,
      });
      await confirmOperation(tezos, operation.hash);
    }
  });
  describe("Failed cases", async () => {
    it("Shouldn't allow transfer positions if sender not operator", async function () {
      tezos.setSignerProvider(bobSigner);
      await rejects(
        poolFa12.transfer([
          {
            from_: alice.pkh,
            txs: [
              {
                to_: bob.pkh,
                token_id: new BigNumber(0),
                amount: new BigNumber(1),
              },
            ],
          },
        ]),
        (err: Error) => {
          equal(err.message.includes("FA2_NOT_OPERATOR"), true);
          return true;
        },
      );
    });
    it("Shouldn't allow update operator if sender not owner", async function () {
      tezos.setSignerProvider(bobSigner);
      await rejects(
        poolFa12.updateOperators([
          {
            add_operator: {
              owner: alice.pkh,
              operator: bob.pkh,
              token_id: new BigNumber(0),
            },
          },
        ]),
        (err: Error) => {
          equal(err.message.includes("FA2_NOT_OWNER"), true);
          return true;
        },
      );
    });
    it("Shouldn't allow transfer non-exists position", async function () {
      tezos.setSignerProvider(bobSigner);
      await rejects(
        poolFa12.transfer([
          {
            from_: alice.pkh,
            txs: [
              {
                to_: bob.pkh,
                token_id: new BigNumber(100),
                amount: new BigNumber(0),
              },
            ],
          },
        ]),
        (err: Error) => {
          equal(err.message.includes("FA2_NOT_OPERATOR"), true);
          return true;
        },
      );
    });
    it("Shouldn't allow transfer if amount > 1", async function () {
      tezos.setSignerProvider(aliceSigner);
      await rejects(
        poolFa12.transfer([
          {
            from_: alice.pkh,
            txs: [
              {
                to_: bob.pkh,
                token_id: new BigNumber(0),
                amount: new BigNumber(2),
              },
            ],
          },
        ]),
        (err: Error) => {
          equal(err.message.includes("FA2_INSUFFICIENT_BALANCE"), true);
          return true;
        },
      );
      await rejects(
        poolFa12.transfer([
          {
            from_: alice.pkh,
            txs: [
              {
                to_: bob.pkh,
                token_id: new BigNumber(0),
                amount: new BigNumber(3),
              },
            ],
          },
        ]),
        (err: Error) => {
          equal(err.message.includes("FA2_INSUFFICIENT_BALANCE"), true);
          return true;
        },
      );
      await rejects(
        poolFa12.transfer([
          {
            from_: alice.pkh,
            txs: [
              {
                to_: bob.pkh,
                token_id: new BigNumber(0),
                amount: new BigNumber(4),
              },
            ],
          },
        ]),
        (err: Error) => {
          equal(err.message.includes("FA2_INSUFFICIENT_BALANCE"), true);
          return true;
        },
      );
    });
  });
  describe("Success cases", async () => {
    it("Should allow transfer position", async function () {
      tezos.setSignerProvider(aliceSigner);
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        await pool.transfer([
          {
            from_: alice.pkh,
            txs: [
              {
                to_: bob.pkh,
                token_id: new BigNumber(0),
                amount: new BigNumber(1),
              },
            ],
          },
        ]);

        const st = await pool.getStorage([new Nat(0), new Nat(1)]);
        const transferedPosition = st.positions.get(new Nat(0));
        equal(transferedPosition.owner, bob.pkh);

        await rejects(
          poolFa12.transfer([
            {
              from_: alice.pkh,
              txs: [
                {
                  to_: carol.pkh,
                  token_id: new BigNumber(0),
                  amount: new BigNumber(1),
                },
              ],
            },
          ]),
          (err: Error) => {
            equal(err.message.includes("FA2_INSUFFICIENT_BALANCE"), true);
            return true;
          },
        );
      }
    });
    it("Should allow update operator", async function () {
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        tezos.setSignerProvider(aliceSigner);
        await pool.updateOperators([
          {
            add_operator: {
              owner: alice.pkh,
              operator: bob.pkh,
              token_id: new BigNumber(1),
            },
          },
        ]);
        const st = await pool.getRawStorage();
        let newOperator = await st.operators.get({
          owner: alice.pkh,
          operator: bob.pkh,
          token_id: "1",
        });
        notEqual(newOperator, undefined);
        tezos.setSignerProvider(bobSigner);
        await pool.transfer([
          {
            from_: alice.pkh,
            txs: [
              {
                to_: eve.pkh,
                token_id: new BigNumber(1),
                amount: new BigNumber(1),
              },
            ],
          },
        ]);

        let updatedPosition = await st.positions.get("1");

        equal(updatedPosition.owner, eve.pkh);

        await rejects(
          pool.transfer([
            {
              from_: alice.pkh,
              txs: [
                {
                  to_: alice.pkh,
                  token_id: new BigNumber(1),
                  amount: new BigNumber(1),
                },
              ],
            },
          ]),
          (err: Error) => {
            equal(err.message.includes("FA2_INSUFFICIENT_BALANCE"), true);
            return true;
          },
        );
        tezos.setSignerProvider(aliceSigner);
        await rejects(
          pool.transfer([
            {
              from_: alice.pkh,
              txs: [
                {
                  to_: peter.pkh,
                  token_id: new BigNumber(1),
                  amount: new BigNumber(1),
                },
              ],
            },
          ]),
          (err: Error) => {
            equal(err.message.includes("FA2_INSUFFICIENT_BALANCE"), true);
            return true;
          },
        );

        tezos.setSignerProvider(eveSigner);
        await pool.transfer([
          {
            from_: eve.pkh,
            txs: [
              {
                to_: alice.pkh,
                token_id: new BigNumber(1),
                amount: new BigNumber(1),
              },
            ],
          },
        ]);
        updatedPosition = await st.positions.get("1");

        equal(updatedPosition.owner, alice.pkh);
      }
    });
    it("Should allow remove operator", async function () {
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        tezos.setSignerProvider(aliceSigner);
        await pool.updateOperators([
          {
            remove_operator: {
              owner: alice.pkh,
              operator: bob.pkh,
              token_id: new BigNumber(1),
            },
          },
        ]);
        const st = await pool.getRawStorage();
        let newOperator = await st.operators.get({
          owner: alice.pkh,
          operator: bob.pkh,
          token_id: "1",
        });
        equal(newOperator, undefined);
        tezos.setSignerProvider(bobSigner);
        await rejects(
          pool.transfer([
            {
              from_: alice.pkh,
              txs: [
                {
                  to_: eve.pkh,
                  token_id: new BigNumber(1),
                  amount: new BigNumber(1),
                },
              ],
            },
          ]),
          (err: Error) => {
            equal(err.message.includes("FA2_NOT_OPERATOR"), true);
            return true;
          },
        );
        tezos.setSignerProvider(aliceSigner);
        await pool.transfer([
          {
            from_: alice.pkh,
            txs: [
              {
                to_: eve.pkh,
                token_id: new BigNumber(1),
                amount: new BigNumber(1),
              },
            ],
          },
        ]);
      }
    });
    it("Should allow get balance of", async function () {
      for (const pool of [poolFa12, poolFa2, poolFa1_2, poolFa2_1]) {
        tezos.setSignerProvider(aliceSigner);
        const balance = await pool.contract.views
          .balance_of([{ owner: alice.pkh, token_id: "0" }])
          .read();
        equal(balance[0].balance.toNumber() >= 0, true);
      }
    });
  });
});
