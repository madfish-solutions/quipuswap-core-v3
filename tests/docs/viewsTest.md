# Test coverage for contracts

## Position.tests

    - ✅ Get the address of tokens X
      actions:
        $ getTokenXAddressView cfmm
      checks:
        response is equal expectedToken

    - ✅ Get the address of tokens Y
      actions:
        $ getTokenYAddressView cfmm
      checks:
        response is equal expectedTokenAddress

    - ✅ Get the id of tokens X
      actions:
        $ getTokenXIdView cfmm
      checks:
        response is equal expectedTokenAddress

    - ✅ Get the id of tokens X
      actions:
        $ getTokenXIdView cfmm
      checks:
        response is equal expectedTokenId

    - ✅ Get the id of tokens Y
      actions:
        $ getTokenYIdView cfmm
      checks:
        response is equal expectedTokenId
