# Quipuswap Core V2

The second version ot the Quipuswap DEX.

This version will support both TOKEN/TOKEN and TOKEN/СTEZ pools, implement more
essential view methods, flash loans, referral and QUIPU buyback fees, better
mechanics for voting and baker rewards distribution, time-weighted average price
for oracles etc.

# Contracts

# Requiremets

- Installed [NodeJS](https://nodejs.org/en/) (tested with NodeJS v17+);
- Installed
  [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable);
- Installed node modules:

  ```shell
    yarn install
  ```

# Compiling

Compilation is splitted into a few steps.

To compile all contracts run the next command:

```shell
  yarn compile
```

# Testing

To run all the tests execute the next command:

```shell
  yarn start-sandbox && yarn test
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
  yarn migrate -n [network_name]
```

Or just execute one of this commands:

```shell
  yarn migrate-ghostnet
  yarn migrate-mainnet
```
