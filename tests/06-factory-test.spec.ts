import { equal, notEqual, rejects } from 'assert';

import { TezosToolkit } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import { accounts } from '../sandbox/accounts';

import DexFactory from './helpers/factoryFacade';
import { poolsFixture } from './fixtures/poolFixture';
import { confirmOperation } from '../scripts/confirmation';
import { Int, Nat, quipuswapV3Types } from '@madfish/quipuswap-v3/dist/types';
import { genFees, genNatIds } from './helpers/utils';
import {
  adjustScale,
  sqrtPriceForTick,
} from '@madfish/quipuswap-v3/dist/helpers/math';
import env from '../env';

const alice = accounts.alice;
const bob = accounts.bob;
const eve = accounts.eve;
const aliceSigner = new InMemorySigner(alice.sk);
const bobSigner = new InMemorySigner(bob.sk);
const maxTickIndex = new Int(1048575);

describe('Factory Tests', async function () {
  let tezos: TezosToolkit;
  let factory: DexFactory;

  let devFee: number = 0;
  before(async () => {
    tezos = new TezosToolkit(env.networks.development.rpc);
    tezos.setSignerProvider(aliceSigner);
    factory = await new DexFactory(tezos, 'development').initialize(devFee);
  });
  describe('Failed cases', async () => {
    it("Shouldn't creating pool with too high fee bps", async function () {
      await rejects(
        factory.deployPool(
          alice.pkh,
          'fa12',
          alice.pkh,
          'fa12',
          10000,
          1,
          0,
          0,
          0,
        ),
        (err: Error) => {
          equal(err.message.includes('402'), true);
          return true;
        },
      );
    });
    it("Shouldn't creating pool with incorrect tick spacing", async function () {
      await rejects(
        factory.deployPool(
          alice.pkh,
          'fa12',
          alice.pkh,
          'fa12',
          1000,
          0,
          0,
          0,
          0,
        ),
        (err: Error) => {
          equal(err.message.includes('112'), true);
          return true;
        },
      );
      await rejects(
        factory.deployPool(
          alice.pkh,
          'fa12',
          alice.pkh,
          'fa12',
          1000,
          0,
          0,
          0,
          maxTickIndex.plus(1).toNumber(),
        ),
        (err: Error) => {
          equal(err.message.includes('112'), true);
          return true;
        },
      );
    });
    it("Shouldn't setting dev fee if not owner", async function () {
      tezos.setSignerProvider(bobSigner);
      await rejects(
        factory.contract.methods.set_dev_fee(1).send(),
        (err: Error) => {
          equal(err.message.includes('420'), true);
          return true;
        },
      );
    });
    it("Shouldn't creating existing pool", async function () {
      await factory.deployPool(
        alice.pkh,
        'fa12',
        alice.pkh,
        'fa12',
        1000,
        1,
        0,
        0,
        0,
      );
      await rejects(
        factory.deployPool(
          alice.pkh,
          'fa12',
          alice.pkh,
          'fa12',
          1000,
          1,
          0,
          0,
          0,
        ),
        (err: Error) => {
          equal(err.message.includes('403'), true);
          return true;
        },
      );
    });
    it("Shouldn't pause/unpause if not owner", async function () {
      tezos.setSignerProvider(bobSigner);
      await rejects(
        factory.setPause([{ update_position_pause: null }]),
        (err: Error) => {
          equal(err.message.includes('420'), true);
          return true;
        },
      );
    });
    it("Shouldn't set owner if not owner", async function () {
      tezos.setSignerProvider(bobSigner);
      await rejects(
        factory.contract.methods.set_owner(bob.pkh).send(),
        (err: Error) => {
          equal(err.message.includes('420'), true);
          return true;
        },
      );
    });
    it("Shouldn't confirm owner if no pending owner", async function () {
      tezos.setSignerProvider(bobSigner);
      await rejects(
        factory.contract.methods.confirm_owner().send(),
        (err: Error) => {
          equal(err.message.includes('421'), true);
          return true;
        },
      );
    });
    it("Shouldn't confirm owner if not pending owner", async function () {
      tezos.setSignerProvider(aliceSigner);
      const tx = await factory.contract.methods.set_owner(eve.pkh).send();
      await confirmOperation(tezos, tx.hash);
      tezos.setSignerProvider(bobSigner);
      await rejects(
        factory.contract.methods.confirm_owner().send(),
        (err: Error) => {
          equal(err.message.includes('422'), true);
          return true;
        },
      );
    });
  });
  describe('Success cases', async () => {
    it('Should setting dev fee', async function () {
      tezos.setSignerProvider(aliceSigner);
      const op = await factory.contract.methods.set_dev_fee(1).send();
      await confirmOperation(tezos, op.hash);
      const storage: any = await factory.contract.storage();
      equal(storage.dev_fee_bps.toNumber(), 1);
    });
    it('Should creating many pools', async function () {
      const { factory, poolFa12, poolFa2, poolFa1_2, poolFa2_1 } =
        await poolsFixture(tezos, [aliceSigner, bobSigner], 0, genFees(4));
      const storage: any = await factory.contract.storage();
      const poolFa12Storage: any = await poolFa12.contract.storage();
      const poolFa2Storage: any = await poolFa2.contract.storage();
      const poolFa1_2Storage: any = await poolFa1_2.contract.storage();
      const poolFa2_1Storage: any = await poolFa2_1.contract.storage();
      equal(storage.pool_count.toNumber(), 4);
      equal(await storage.pools.get('0'), poolFa12.contract.address);
      equal(await storage.pools.get('1'), poolFa2.contract.address);
      equal(await storage.pools.get('2'), poolFa1_2.contract.address);
      equal(await storage.pools.get('3'), poolFa2_1.contract.address);
      equal(
        await storage.pool_ids.get({
          fee_bps: poolFa12Storage.constants.fee_bps.toFixed(),
          token_x: poolFa12Storage.constants.token_x,
          token_y: poolFa12Storage.constants.token_y,
        }),
        '0',
      );
      equal(
        await storage.pool_ids.get({
          fee_bps: poolFa2Storage.constants.fee_bps.toFixed(),
          token_x: poolFa2Storage.constants.token_x,
          token_y: poolFa2Storage.constants.token_y,
        }),
        '1',
      );
      equal(
        await storage.pool_ids.get({
          fee_bps: poolFa1_2Storage.constants.fee_bps.toFixed(),
          token_x: poolFa1_2Storage.constants.token_x,
          token_y: poolFa1_2Storage.constants.token_y,
        }),
        '2',
      );
      equal(
        await storage.pool_ids.get({
          fee_bps: poolFa2_1Storage.constants.fee_bps.toFixed(),
          token_x: poolFa2_1Storage.constants.token_x,
          token_y: poolFa2_1Storage.constants.token_y,
        }),
        '3',
      );
      equal(
        await poolFa12Storage.metadata.get('name'),
        '517569707573776170204c5020546f6b656e',
      );
      equal(await poolFa12Storage.metadata.get('symbol'), '515054');
      equal(await poolFa12Storage.metadata.get('decimals'), '36');
      equal(
        await poolFa12Storage.metadata.get('description'),
        '517569707573776170204c5020746f6b656e20726570726573656e7473207573657220736861726520696e20746865206c697175696469747920706f6f6c',
      );
      equal(
        await poolFa12Storage.metadata.get('thumbnailUri'),
        '68747470733a2f2f7175697075737761702e636f6d2f51504c502e706e67',
      );
      equal(
        await poolFa12Storage.metadata.get('shouldPreferSymbol'),
        '74727565',
      );
    });
    it('Should creating many pools with different start tick index', async function () {
      const { factory, poolFa12, poolFa2, poolFa1_2, poolFa2_1 } =
        await poolsFixture(
          tezos,
          [aliceSigner, bobSigner],
          0,
          genFees(4),
          false,
          0,
          [1, 1, 1, 1],
          [-1000, -100, 0, 1000],
        );
      const storage: any = await factory.contract.storage();
      const poolFa12Storage: any = await poolFa12.contract.storage();
      const poolFa2Storage: any = await poolFa2.contract.storage();
      const poolFa1_2Storage: any = await poolFa1_2.contract.storage();
      const poolFa2_1Storage: any = await poolFa2_1.contract.storage();
      equal(storage.pool_count.toNumber(), 4);
      equal(await storage.pools.get('0'), poolFa12.contract.address);
      equal(await storage.pools.get('1'), poolFa2.contract.address);
      equal(await storage.pools.get('2'), poolFa1_2.contract.address);
      equal(await storage.pools.get('3'), poolFa2_1.contract.address);

      equal(poolFa12Storage.cur_tick_index.toNumber(), -1000);
      equal(poolFa2Storage.cur_tick_index.toNumber(), -100);
      equal(poolFa1_2Storage.cur_tick_index.toNumber(), 0);
      equal(poolFa2_1Storage.cur_tick_index.toNumber(), 1000);

      const sqrtPrice_1 = sqrtPriceForTick(new Int(-1000));
      const sqrtPrice_2 = sqrtPriceForTick(new Int(-100));
      const sqrtPrice_3 = sqrtPriceForTick(new Int(0));
      const sqrtPrice_4 = sqrtPriceForTick(new Int(1000));

      equal(
        adjustScale(
          new Nat(poolFa12Storage.sqrt_price),
          new Nat(80),
          new Nat(30),
        ).toFixed(),
        adjustScale(new Nat(sqrtPrice_1), new Nat(80), new Nat(30)).toFixed(),
      );
      equal(
        adjustScale(
          new Nat(poolFa2Storage.sqrt_price),
          new Nat(80),
          new Nat(30),
        ).toFixed(),
        adjustScale(new Nat(sqrtPrice_2), new Nat(80), new Nat(30)).toFixed(),
      );
      equal(
        adjustScale(
          new Nat(poolFa1_2Storage.sqrt_price),
          new Nat(80),
          new Nat(30),
        ).toFixed(),
        adjustScale(new Nat(sqrtPrice_3), new Nat(80), new Nat(30)).toFixed(),
      );
      equal(
        adjustScale(
          new Nat(poolFa2_1Storage.sqrt_price),
          new Nat(80),
          new Nat(30),
        ).toFixed(),
        adjustScale(new Nat(sqrtPrice_4), new Nat(80), new Nat(30)).toFixed(),
      );
    });
    it('Should creating many pools with custom tick spacing and extraSlots', async function () {
      const { factory, poolFa12, poolFa2, poolFa1_2, poolFa2_1 } =
        await poolsFixture(
          tezos,
          [aliceSigner, bobSigner],
          50,
          genFees(4),
          false,
          0,
          [42, 42, 42, 42],
          [-1000, -100, 0, 1000],
        );
      const storage: any = await factory.contract.storage();
      const poolFa12Storage: quipuswapV3Types.Storage =
        await poolFa12.getStorage([], [], genNatIds(60));
      const poolFa2Storage: quipuswapV3Types.Storage = await poolFa2.getStorage(
        [],
        [],
        genNatIds(60),
      );
      const poolFa1_2Storage: quipuswapV3Types.Storage =
        await poolFa1_2.getStorage([], [], genNatIds(60));
      const poolFa2_1Storage: quipuswapV3Types.Storage =
        await poolFa2_1.getStorage([], [], genNatIds(60));
      equal(storage.pool_count.toNumber(), 4);
      equal(await storage.pools.get('0'), poolFa12.contract.address);
      equal(await storage.pools.get('1'), poolFa2.contract.address);
      equal(await storage.pools.get('2'), poolFa1_2.contract.address);
      equal(await storage.pools.get('3'), poolFa2_1.contract.address);

      equal(poolFa12Storage.cumulativesBuffer.reservedLength.toNumber(), 51);
      equal(poolFa2Storage.cumulativesBuffer.reservedLength.toNumber(), 51);
      equal(poolFa1_2Storage.cumulativesBuffer.reservedLength.toNumber(), 51);
      equal(poolFa2_1Storage.cumulativesBuffer.reservedLength.toNumber(), 51);
      equal(Object.keys(poolFa12Storage.cumulativesBuffer.map.map).length, 51);

      equal(poolFa12Storage.constants.tickSpacing.toNumber(), 42);
      equal(poolFa2Storage.constants.tickSpacing.toNumber(), 42);
      equal(poolFa1_2Storage.constants.tickSpacing.toNumber(), 42);
      equal(poolFa2_1Storage.constants.tickSpacing.toNumber(), 42);
    });
    it('Should pause/unpause pools', async function () {
      tezos.setSignerProvider(aliceSigner);
      await factory.setPause([
        { set_position_pause: null },
        { update_position_pause: null },
        { x_to_y_pause: null },
        { y_to_x_pause: null },
      ]);
      const storage: any = await factory.contract.storage();
      notEqual(storage.pause_state[0]['set_position_pause'], undefined);
      notEqual(storage.pause_state[1]['update_position_pause'], undefined);
      notEqual(storage.pause_state[2]['x_to_y_pause'], undefined);
      notEqual(storage.pause_state[3]['y_to_x_pause'], undefined);
      await factory.setPause([]);
      const storage2: any = await factory.contract.storage();
      equal(storage2.pause_state.length, 0);
    });
    it('Should set owner', async function () {
      tezos.setSignerProvider(aliceSigner);
      const tx = await factory.contract.methods.set_owner(bob.pkh).send();
      await confirmOperation(tezos, tx.hash);
      const storage: any = await factory.contract.storage();
      equal(storage.pending_owner, bob.pkh);
    });
    it('Should confirm owner', async function () {
      tezos.setSignerProvider(bobSigner);
      const tx = await factory.contract.methods.confirm_owner().send();
      await confirmOperation(tezos, tx.hash);
      const storage: any = await factory.contract.storage();
      equal(storage.pending_owner, null);
      equal(storage.owner, bob.pkh);
    });
  });
});
