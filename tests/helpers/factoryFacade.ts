import { Contract, MichelsonMap, TezosToolkit } from "@taquito/taquito";
import { migrate } from "./../../scripts/helpers";

import factoryStorage from "./../../storage/factoryStorage";
import { confirmOperation } from "./../../scripts/confirmation";
import { BytesLiteral } from "@taquito/michel-codec";
import { MichelsonMapKey } from "@taquito/michelson-encoder";

export default class Factory {
  contract: Contract;
  constructor(private tezos: TezosToolkit, private network: string) {}

  async initialize(devFee: number = 0, factoryAddress?: string) {
    if (factoryAddress) {
      this.contract = await this.tezos.contract.at(factoryAddress);
    } else {
      factoryStorage.dev_fee_bps = devFee;
      factoryStorage.owner = await this.tezos.signer.publicKeyHash();
      const deployedAddress = await migrate(
        this.tezos,
        "factory",
        factoryStorage,
        this.network,
      );
      this.contract = await this.tezos.contract.at(deployedAddress!);
    }
    return this;
  }
  async deployPool(
    xTokenAddress: string,
    xTokenType: string,
    yTokenAddress: string,
    yTokenType: string,
    feeBPS: number,
    tickSpacing: number,
    extraSlots: number,
    metadata: MichelsonMap<MichelsonMapKey, unknown>,
    xTokenId: number = 0,
    yTokenId: number = 0,
    returnParams: boolean = false,
    currentTick: string = "0",
  ) {
    let op;
    if (returnParams) {
      if (xTokenType === "fa2" && yTokenType === "fa2") {
        op = await this.contract.methods
          .deploy_pool(
            currentTick,
            xTokenType,
            xTokenId,
            xTokenAddress,
            yTokenType,
            yTokenId,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            extraSlots,
            metadata,
          )
          .toTransferParams();
      } else if (xTokenType === "fa2" && yTokenType === "fa12") {
        op = await this.contract.methods
          .deploy_pool(
            currentTick,
            xTokenType,
            xTokenId,
            xTokenAddress,
            yTokenType,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            extraSlots,
            metadata,
          )
          .toTransferParams();
      } else if (xTokenType === "fa12" && yTokenType === "fa2") {
        op = await this.contract.methods
          .deploy_pool(
            currentTick,
            xTokenType,
            xTokenAddress,
            yTokenType,
            yTokenId,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            extraSlots,
            metadata,
          )
          .toTransferParams();
      } else if (xTokenType === "fa12" && yTokenType === "fa12") {
        op = await this.contract.methods
          .deploy_pool(
            currentTick,
            xTokenType,
            xTokenAddress,
            yTokenType,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            extraSlots,
            metadata,
          )
          .toTransferParams();
      }
      return op;
    } else {
      if (xTokenType === "fa2" && yTokenType === "fa2") {
        op = await this.contract.methods
          .deploy_pool(
            currentTick,
            xTokenType,
            xTokenId,
            xTokenAddress,
            yTokenType,
            yTokenId,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            extraSlots,
            metadata,
          )
          .send();
      } else if (xTokenType === "fa2" && yTokenType === "fa12") {
        op = await this.contract.methods
          .deploy_pool(
            currentTick,
            xTokenType,
            xTokenId,
            xTokenAddress,
            yTokenType,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            extraSlots,
            metadata,
          )
          .send();
      } else if (xTokenType === "fa12" && yTokenType === "fa2") {
        op = await this.contract.methods
          .deploy_pool(
            currentTick,
            xTokenType,
            xTokenAddress,
            yTokenType,
            yTokenId,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            extraSlots,
            metadata,
          )
          .send();
      } else if (xTokenType === "fa12" && yTokenType === "fa12") {
        op = await this.contract.methods
          .deploy_pool(
            currentTick,
            xTokenType,
            xTokenAddress,
            yTokenType,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            extraSlots,
            metadata,
          )
          .send();
      }
      await confirmOperation(this.tezos, op.hash);
      const storage = (await this.contract.storage()) as any;
      return await storage.pools.get(
        (storage.pool_count.toString() - 1).toString(),
      );
    }
  }
  async getPools(ids: number[]) {
    const storage = (await this.contract.storage()) as any;
    const pools = await Promise.all(
      ids.map(async id => {
        try {
          await storage.pools.get(id.toString());
          return await storage.pools.get(id.toString());
        } catch (e) {
          return null;
        }
      }),
    );
    return pools;
  }
}
