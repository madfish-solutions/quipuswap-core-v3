type factory_storage_t = {
  pool_count: nat;
  pools: (nat, address) big_map;
}

type return_t = (operation list * factory_storage_t)

type deploy_pool_func_t = (key_hash option * tez * storage) -> (operation * address)

type create_dex_t =
  [@layout:comb]
  { x_token_id : nat ;
    x_token_address : address ;
    y_token_id : nat ;
    y_token_address : address ;
    fee_bps : nat ;
    metadata: metadata_map ;
  }

type parameter_t =
| Deploy_pool of create_dex_t
