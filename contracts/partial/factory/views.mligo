(* ONchain view method for get Owner from storage *)
[@view]let get_owner (_p, s :  unit * factory_storage_t) : address =
  s.owner

[@view]let check_pause(p, s : pause_etp * factory_storage_t) : bool =
  Set.mem p s.pause_state