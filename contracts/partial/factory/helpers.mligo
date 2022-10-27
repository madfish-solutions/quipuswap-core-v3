let init_pool_storage (p : create_dex_t) : storage =
  let constants : constants = {
    fee_bps = p.fee_bps ;
    ctez_burn_fee_bps = 5n ;
    x_token_id = p.x_token_id ;
    y_token_id = p.y_token_id ;
    x_token_address = p.x_token_address ;
    y_token_address = p.y_token_address ;
    tick_spacing = 1n ;
  } in

  ( default_storage (constants) (0n) (p.metadata) : storage)

let deploy_pool_func : deploy_pool_func_t =
[%Michelson ( {| { UNPPAIIR ;
                  CREATE_CONTRACT
#include "../../../build/dex_core.tz"
        ;
          PAIR } |}
 : deploy_pool_func_t)]


