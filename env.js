import { MichelsonMap } from "@taquito/michelson-encoder";
import { accounts } from "./sandbox/accounts";

export default {
  confirmationPollingTimeoutSecond: 500000,
  syncInterval: 0, // 0 for tests, 5000 for deploying
  confirmTimeout: 90000, // 90000 for tests, 180000 for deploying
  buildDir: "build",
  migrationsDir: "migrations",
  contractsDir: "contracts/main",
  ligoVersion: "0.54.1",
  network: "development",
  networks: {
    development: {
      rpc: "http://localhost:8732",
      network_id: "*",
      secretKey: accounts.alice.sk,
      pools: {
        0: {
          tokenX: {
            token_type: "FA2",
            token_id: 0,
            token_address: "KT1J8Hr3BP8bpbfmgGpRPoC9nAMSYtStZG43",
          },

          tokenY: {
            token_type: "FA2",
            token_id: 0,
            token_address: "KT1X125rpfx7v2jxApYKQknh5gkkDWHJVuCn",
          },
          feeBPS: 10,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("Test Pool", "ascii").toString("hex"),
            description: Buffer.from("Test Pool", "ascii").toString("hex"),
            symbol: Buffer.from("TEST", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
        1: {
          tokenX: {
            token_type: "FA2",
            token_id: 0,
            token_address: "KT19363aZDTjeRyoDkSLZhCk62pS4xfvxo6c",
          },

          tokenY: {
            token_type: "FA2",
            token_id: 0,
            token_address: "KT1X125rpfx7v2jxApYKQknh5gkkDWHJVuCn",
          },
          feeBPS: 10,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("Test Pool 2", "ascii").toString("hex"),
            description: Buffer.from("Test Pool 2", "ascii").toString("hex"),
            symbol: Buffer.from("TEST2", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
      },
    },
    ghostnet: {
      rpc: "https://rpc.ghostnet.teztnets.xyz",
      port: 443,
      network_id: "*",
      secretKey: accounts.dev.sk,
      pools: {
        0: {
          tokenX: {
            token_type: "FA2",
            token_id: 0,
            token_address: "KT19363aZDTjeRyoDkSLZhCk62pS4xfvxo6c",
          },

          tokenY: {
            token_type: "FA1",
            token_id: 0,
            token_address: "KT1GG8Zd5rUp1XV8nMPRBY2tSyVn6NR5F4Q1",
          },
          feeBPS: 10,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("QSGov/Kolibri", "ascii").toString("hex"),
            description: Buffer.from("QSGov/Kolibri", "ascii").toString("hex"),
            symbol: Buffer.from("QSGovKolibri", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
        1: {
          tokenX: {
            token_type: "FA2",
            token_id: 0,
            token_address: "KT19363aZDTjeRyoDkSLZhCk62pS4xfvxo6c",
          },

          tokenY: {
            token_type: "FA2",
            token_id: 0,
            token_address: "KT1N4NfnYmJucXYkuPdvJG4Jxbz3TetCTqJc",
          },
          feeBPS: 10,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("QSGov/Youves", "ascii").toString("hex"),
            description: Buffer.from("QSGov/Youves", "ascii").toString("hex"),
            symbol: Buffer.from("QSGov/Youves", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
      },
    },
    // mainnet: {
    //   rpc: "https://mainnet.api.tez.ie",
    //   port: 443,
    //   network_id: "*",
    //   secretKey: accounts.deployer.sk,
    // },
  },
};
