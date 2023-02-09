# Quipuswap Core V3

This repository contains the implementation of a constant product market making
smart contract that allows the curve to be defined on price segments. This
project is a fork of segmented-cfmm, based on the ideas described in the Uniswap
V3 whitepaper.

Our smart contracts differ from segmented-cfmm in several ways:

- We added a Pool Factory contract
- We removed support for the CTEZ, we used the FA2 wXTZ
- We fixed existing issues
- We rewrited the Haskell part of the project to Typescript

With these changes, our contracts provide a more robust and reliable solution
for market making on the blockchain.

# Contracts

# Requiremets

- Installed [NodeJS](https://nodejs.org/en/) (tested with NodeJS v17+);
- Installed
  [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable);
- Installed node modules:

  ```shell
    yarn install
  ```

Rename the `.env.template` file to `.env` and fill it with the required.

# Compiling

Compilation is splitted into a few steps.

To compile all contracts run the next command:

```shell
  yarn compile
```

# Testing

To run all the tests execute the next command:

```shell
  yarn test
```

# Deploy

To deploy the contracts you should run the following command:

```shell
  yarn migrate
```

By default, the contracts will be deployed to the `development` network (in the
Docker container).

Also, you can specify the network for deploying (possible networks: `ghostnet`,
`mainnet`):

```shell
  yarn migrate-ghostnet
  yarn migrate-mainnet
```
