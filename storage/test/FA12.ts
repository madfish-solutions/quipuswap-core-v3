import { MichelsonMap } from "@taquito/michelson-encoder";

import { BigNumber } from "bignumber.js";

import { fa12Types } from "@madfish/quipuswap-v3/dist/types";

import { accounts } from "./../../sandbox/accounts";

const totalSupply: BigNumber = new BigNumber(1e12);

export const fa12Storage: fa12Types.FA12Storage = {
  total_supply: totalSupply,
  ledger: MichelsonMap.fromLiteral({
    [accounts.alice.pkh]: {
      balance: totalSupply.dividedBy(3).integerValue(BigNumber.ROUND_DOWN),
      allowances: MichelsonMap.fromLiteral({}),
    },
    [accounts.bob.pkh]: {
      balance: totalSupply.dividedBy(3).integerValue(BigNumber.ROUND_DOWN),
      allowances: MichelsonMap.fromLiteral({}),
    },
    [accounts.carol.pkh]: {
      balance: totalSupply.dividedBy(3).integerValue(BigNumber.ROUND_DOWN),
      allowances: MichelsonMap.fromLiteral({}),
    },
    [accounts.eve.pkh]: {
      balance: totalSupply.dividedBy(3).integerValue(BigNumber.ROUND_DOWN),
      allowances: MichelsonMap.fromLiteral({}),
    },
  }),
  metadata: MichelsonMap.fromLiteral({}),
  token_metadata: MichelsonMap.fromLiteral({}),
};
