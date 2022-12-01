type factory_storage_t = {
  owner: address;
  pool_count: nat;
  pools: (nat, address) big_map;
  dev_fee_bps : nat;
}

type return_t = (operation list * factory_storage_t)

type deploy_pool_func_t = (key_hash option * tez * storage) -> (operation * address)

type create_dex_t =
  [@layout:comb]
  { token_x: asset_standard_t ;
    token_y: asset_standard_t ;
    fee_bps : nat ;
    tick_spacing : nat ;
    metadata: metadata_map ;
  }

type parameter_t =
| Deploy_pool of create_dex_t
| Default     of unit
