import {
  OriginationOperation,
  TransactionOperation,
  TezosToolkit,
  Contract,
} from '@taquito/taquito';

import fs from 'fs';

import { BigNumber } from 'bignumber.js';

import { confirmOperation } from '../../scripts/confirmation';

import { fa12Types } from '@madfish/quipuswap-v3/dist/types';

export class FA12 {
  storage: fa12Types.FA12Storage;
  tezos: TezosToolkit;
  contract: Contract;

  constructor(contract: Contract, tezos: TezosToolkit) {
    this.contract = contract;
    this.tezos = tezos;
  }

  static async init(fa12Address: string, tezos: TezosToolkit): Promise<FA12> {
    return new FA12(await tezos.contract.at(fa12Address), tezos);
  }

  static async originate(
    tezos: TezosToolkit,
    storage: fa12Types.FA12Storage,
  ): Promise<FA12> {
    const artifacts: any = JSON.parse(
      fs.readFileSync(`tests/contracts/fa12.json`).toString(),
    );

    const operation: any = await tezos.contract
      .originate({
        code: artifacts.michelson,
        storage: storage,
      })
      .catch(e => {
        console.error(e);

        return null;
      });

    await confirmOperation(tezos, operation.hash);

    return new FA12(await tezos.contract.at(operation.contractAddress), tezos);
  }

  async updateStorage(maps = {}): Promise<void> {
    const storage: fa12Types.FA12Storage = await this.contract.storage();

    this.storage = storage;

    // for (const key in maps) {
    //   this.storage[key] = await maps[key].reduce(
    //     async (prev: any, current: any) => {
    //       try {
    //         return {
    //           ...(await prev),
    //           [current]: await storage[key].get(current),
    //         };
    //       } catch (ex) {
    //         return {
    //           ...(await prev),
    //           [current]: 0,
    //         };
    //       }
    //     },
    //     Promise.resolve({}),
    //   );
    // }
  }

  async transfer(
    from: string,
    to: string,
    value: BigNumber,
  ): Promise<TransactionOperation> {
    const operation: TransactionOperation = await this.contract.methods
      .transfer(from, to, value.toString())
      .send();

    await operation.confirmation(5);

    return operation;
  }

  async approve(
    spender: string,
    value: BigNumber,
    returnTransferParams: boolean = false,
  ) {
    if (returnTransferParams) {
      const transferParams = await this.contract.methods
        .approve(spender, value.toString())
        .toTransferParams();

      return transferParams;
    } else {
      const operation: TransactionOperation = await this.contract.methods
        .approve(spender, value.toString())
        .send();

      await operation.confirmation(5);

      return operation;
    }
  }

  async getBalance(user: string): Promise<BigNumber> {
    await this.updateStorage();
    let balance = 0;
    try {
      const account = (await this.storage.ledger.get(user)) as any;
      return account.balance as BigNumber;
    } catch (e) {
      return new BigNumber(0);
    }
  }
}
