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
          name: "KUSD/KUSD",
          tickIndex: 0,
          tokenX: {
            fa12: "KT1Q1qqJAzzxzGzQB6RmxnAKgxttf7Hntceg",
          },

          tokenY: {
            fa12: "KT1EjAaRRQpaZrbDEcEG6aEGuydwUkAtXsBU",
          },
          feeBPS: 100,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("KUSD/KUSD", "ascii").toString("hex"),
            description: Buffer.from("Test Pool", "ascii").toString("hex"),
            symbol: Buffer.from("KUSD/KUSD", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
        1: {
          name: "KUSD/Tea",
          tickIndex: 10986,
          tokenX: { fa12: "KT1GG8Zd5rUp1XV8nMPRBY2tSyVn6NR5F4Q1" },

          tokenY: {
            fa2: {
              token_id: 1,
              token_address: "KT18uv7PtGedfudtG7QwFTrDBRjdLe5qj2my",
            },
          },
          feeBPS: 50,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("KUSD/Tea", "ascii").toString("hex"),
            description: Buffer.from("Test Pool 2", "ascii").toString("hex"),
            symbol: Buffer.from("KUSD/Tea", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
        2: {
          name: "QUIPU/KUSD",
          tickIndex: -6931,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: "KT19363aZDTjeRyoDkSLZhCk62pS4xfvxo6c",
            },
          },

          tokenY: {
            fa12: "KT1Wgp6qSsDN7mCaDk5XDEQU52MezE8B9mr5",
          },
          feeBPS: 10,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("QUIPU/KUSD", "ascii").toString("hex"),
            description: Buffer.from("Test Pool 2", "ascii").toString("hex"),
            symbol: Buffer.from("QUIPU/KUSD", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
        3: {
          name: "Grape/uUSD",
          tickIndex: 19460,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: "KT18uv7PtGedfudtG7QwFTrDBRjdLe5qj2my",
            },
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: "KT1N4NfnYmJucXYkuPdvJG4Jxbz3TetCTqJc",
            },
          },
          feeBPS: 500,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("Grape/uUSD", "ascii").toString("hex"),
            description: Buffer.from("Test Pool 4", "ascii").toString("hex"),
            symbol: Buffer.from("Grape/uUSD", "ascii").toString("hex"),
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
          name: "KUSD/KUSD",
          tickIndex: -69081,
          tokenX: {
            fa12: "KT1Q1qqJAzzxzGzQB6RmxnAKgxttf7Hntceg",
          },

          tokenY: {
            fa12: "KT1EjAaRRQpaZrbDEcEG6aEGuydwUkAtXsBU",
          },
          feeBPS: 100,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("KUSD/KUSD", "ascii").toString("hex"),
            description: Buffer.from("Test Pool", "ascii").toString("hex"),
            symbol: Buffer.from("KUSD/KUSD", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
        1: {
          name: "KUSD/Tea",
          tickIndex: -219283,
          tokenX: { fa12: "KT1GG8Zd5rUp1XV8nMPRBY2tSyVn6NR5F4Q1" },

          tokenY: {
            fa2: {
              token_id: 1,
              token_address: "KT18uv7PtGedfudtG7QwFTrDBRjdLe5qj2my",
            },
          },
          feeBPS: 50,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("KUSD/Tea", "ascii").toString("hex"),
            description: Buffer.from("Test Pool 2", "ascii").toString("hex"),
            symbol: Buffer.from("KUSD/Tea", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
        2: {
          name: "QUIPU/KUSD",
          tickIndex: 269392,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: "KT19363aZDTjeRyoDkSLZhCk62pS4xfvxo6c",
            },
          },

          tokenY: {
            fa12: "KT1Wgp6qSsDN7mCaDk5XDEQU52MezE8B9mr5",
          },
          feeBPS: 10,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("QUIPU/KUSD", "ascii").toString("hex"),
            description: Buffer.from("Test Pool 2", "ascii").toString("hex"),
            symbol: Buffer.from("QUIPU/KUSD", "ascii").toString("hex"),
            shouldPreferSymbol: Buffer.from("true", "ascii").toString("hex"),
            thumbnailUri: Buffer.from(
              "https://i.imgur.com/1J8Hr3B.png",
              "ascii",
            ).toString("hex"),
          }),
        },
        3: {
          name: "Grape/uUSD",
          tickIndex: 152025,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: "KT18uv7PtGedfudtG7QwFTrDBRjdLe5qj2my",
            },
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: "KT1N4NfnYmJucXYkuPdvJG4Jxbz3TetCTqJc",
            },
          },
          feeBPS: 500,
          metadata: MichelsonMap.fromLiteral({
            name: Buffer.from("Grape/uUSD", "ascii").toString("hex"),
            description: Buffer.from("Test Pool 4", "ascii").toString("hex"),
            symbol: Buffer.from("Grape/uUSD", "ascii").toString("hex"),
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
