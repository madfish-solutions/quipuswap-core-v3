let init_pool_storage (p : create_dex_t) : storage =
  let constants : constants = {
    fee_bps = 0n ;
    ctez_burn_fee_bps = 0n ;
    x_token_id = p.x_token_id ;
    y_token_id = p.y_token_id ;
    x_token_address = p.x_token_address ;
    y_token_address = p.y_token_address ;
    tick_spacing = 0n ;
  } in

  let timed_cumulatives_buffer = {
    map = (Big_map.empty : (nat, timed_cumulatives) big_map) ;
    first = 0n ;
    last = 0n ;
    reserved_length = 0n ;
  } in

  ({
    liquidity = 0n ;
    sqrt_price = { x80 = 0n };
    cur_tick_index = { i = 0 } ;
    cur_tick_witness = { i = 0 }  ;
    fee_growth = { x = { x128 = 0n } ; y = { x128 = 0n } } ;
    ticks = (Big_map.empty : tick_map) ;
    positions = (Big_map.empty : position_map) ;
    cumulatives_buffer = timed_cumulatives_buffer ;
    metadata = (Big_map.empty : metadata_map) ;
    new_position_id = 0n;
    operators = (Big_map.empty : operators) ;
    constants = constants ;
    ladder = (Big_map.empty : ladder) ;
  } : storage)

let deploy_pool_func : deploy_pool_func_t =
[%Michelson ( {| { UNPPAIIR ;
                  CREATE_CONTRACT
#include "../../../build/dex_core.tz"
        ;
          PAIR } |}
 : deploy_pool_func_t)]


