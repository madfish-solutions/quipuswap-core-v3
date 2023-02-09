import { MichelsonMap } from '@taquito/michelson-encoder';
import { accounts } from '../sandbox/accounts';

export default {
  owner: accounts.alice.pkh,
  pool_count: 0,
  pools: MichelsonMap.fromLiteral({}),
  pool_ids: MichelsonMap.fromLiteral({}),
  dev_fee_bps: 3000,
  pause_state: [],
};
