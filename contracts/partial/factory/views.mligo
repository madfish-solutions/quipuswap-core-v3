(* ONchain view method for get Owner from storage *)
[@view]let get_owner (_p, s :  unit * factory_storage_t) : address =
  s.owner