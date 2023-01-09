let init_pool_storage (p : create_dex_t) (dev_fee_bps : nat) : storage =
  let constants : constants = {
    factory_address = Tezos.get_self_address ();
    fee_bps = p.fee_bps ;
    dev_fee_bps = dev_fee_bps ;
    token_x = p.token_x ;
    token_y = p.token_y ;
    tick_spacing = p.tick_spacing ;
  } in

  ( default_storage (constants) (p.extra_slots) (p.metadata) : storage)

let deploy_pool_func : deploy_pool_func_t =
[%Michelson ( {| { UNPPAIIR ;
                  CREATE_CONTRACT
#include "../../../build/dex_core.tz"
        ;
          PAIR } |}
 : deploy_pool_func_t)]


