type pool_key_t =
    [@layout:comb] {
    fee_bps : nat ;
    token_x : asset_standard_t;
    token_y : asset_standard_t;
}

type factory_storage_t = {
  owner: address;
  pool_count: nat;
  pools: (nat, address) big_map;
  pool_ids: (pool_key_t, nat) big_map;
  dev_fee_bps : nat;
}

type return_t = (operation list * factory_storage_t)

type deploy_pool_func_t = (key_hash option * tez * storage) -> (operation * address)

type create_dex_t =
  [@layout:comb]
  { cur_tick_index: tick_index ;
    token_x: asset_standard_t ;
    token_y: asset_standard_t ;
    fee_bps : nat ;
    tick_spacing : nat ;
    extra_slots : nat ;
  }

type parameter_t =
| Deploy_pool of create_dex_t
| Set_dev_fee of nat
