// SPDX-FileCopyrightText: 2021 Arthur Breitman
// SPDX-License-Identifier: LicenseRef-MIT-Arthur-Breitman

#include "../partial/common_types.mligo"

#include "../partial/errors.mligo"

#include "../partial/types.mligo"
#include "../partial/consts.mligo"
#include "../partial/math.mligo"

#include "../partial/defaults.mligo"

#include "../partial/token/fa2.mligo"
#include "../partial/transfers.mligo"
#include "../partial/helpers.mligo"

#include "../partial/swaps.mligo"

#include "../partial/methods.mligo"
#define DEBUG



let main ((p, s) : parameter * storage) : result =
let _: unit = if Tezos.get_amount () = 0tez then unit else failwith non_zero_transfer_err in
(* start by updating the oracles *)
let s = update_timed_cumulatives s in
(* dispatch call to the proper entrypoint *)
 match p with
| X_to_y p -> x_to_y s p
| Y_to_x p -> y_to_x s p
| Set_position p -> set_position s p
| Update_position p -> update_position s p
| Get_position_info p -> get_position_info s p
| Claim_dev_fee p -> claim_dev_fee s p
| Call_fa2 p -> call_fa2 s p
| Snapshot_cumulatives_inside p -> snapshot_cumulatives_inside(s, p)
| Observe p -> observe s p
| Increase_observation_count n -> increase_observation_count(s, n)
