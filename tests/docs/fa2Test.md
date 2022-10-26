# Test coverage for contracts

## FA2.hs

    - ✅ Сreate positions;
    - ✅ Assign operators;
    - ✅ The 'ownerAndOperator' can transfer its own positions;
    - ✅ The 'ownerAndOperator' cannot transfer positions it's not operator of;
    - ✅ The 'ownerAndOperator' can transfer positions it's operator of
    - ✅ The 'ownerOnly' can no longer transfer the operated positions
    - ✅ The 'ownerOnly' can still transfer the owned positions
    - ✅ In the end all positions should be owned by 'finalOwner'
