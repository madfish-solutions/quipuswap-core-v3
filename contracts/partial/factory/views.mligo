(* ONchain view method for get Owner from storage *)
[@view]let get_owner (_p, s :  unit * factory_storage_t) : address =
  s.owner

[@view]let check_pause(p, s : pause_etp * factory_storage_t) : bool =
  Set.mem p s.pause_state

[@view]let get_dev_fee(_p, s : unit * factory_storage_t) : nat =
  s.dev_fee_bps

[@view]let get_token_metadata(token_id, s : nat * factory_storage_t) : token_metadata =
  match Big_map.find_opt token_id s.token_metadata with
  | Some v -> v
  | None -> (failwith not_token_metadata_err : token_metadata)