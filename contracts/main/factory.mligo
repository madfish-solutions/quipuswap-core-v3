#include "../partial/types.mligo"
#include "../partial/factory/types.mligo"
#include "../partial/defaults.mligo"
#include "../partial/factory/helpers.mligo"
#include "../partial/factory/methods.mligo"

let main (action, s : parameter_t * factory_storage_t) : return_t =
 // No operations
 (match action with
  | Deploy_pool (n) -> deploy_pool (s, n)
  | Default () -> ([], s)
 )


