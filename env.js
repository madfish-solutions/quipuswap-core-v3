import { accounts } from './sandbox/accounts';

export default {
  confirmationPollingTimeoutSecond: 500000,
  syncInterval: 0, // 0 for tests, 5000 for deploying
  confirmTimeout: 90000, // 90000 for tests, 180000 for deploying
  buildDir: 'build',
  migrationsDir: 'migrations',
  contractsDir: 'contracts/main',
  ligoVersion: '0.54.1',
  network: 'development',
  networks: {
    development: {
      rpc: 'http://localhost:8732',
      network_id: '*',
      secretKey: accounts.alice.sk,
      pools: {
        0: {
          name: 'KUSD/KUSD',
          tickIndex: 0,
          tokenX: {
            fa12: 'KT1Q1qqJAzzxzGzQB6RmxnAKgxttf7Hntceg',
          },

          tokenY: {
            fa12: 'KT1EjAaRRQpaZrbDEcEG6aEGuydwUkAtXsBU',
          },
          feeBPS: 100,
          extraSlots: 41,
        },
        1: {
          name: 'KUSD/Tea',
          tickIndex: 10986,
          tokenX: { fa12: 'KT1GG8Zd5rUp1XV8nMPRBY2tSyVn6NR5F4Q1' },

          tokenY: {
            fa2: {
              token_id: 1,
              token_address: 'KT18uv7PtGedfudtG7QwFTrDBRjdLe5qj2my',
            },
          },
          feeBPS: 50,
          extraSlots: 41,
        },
        2: {
          name: 'QUIPU/KUSD',
          tickIndex: -6931,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT19363aZDTjeRyoDkSLZhCk62pS4xfvxo6c',
            },
          },

          tokenY: {
            fa12: 'KT1Wgp6qSsDN7mCaDk5XDEQU52MezE8B9mr5',
          },
          feeBPS: 10,
          extraSlots: 41,
        },
        3: {
          name: 'Grape/uUSD',
          tickIndex: 19460,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT18uv7PtGedfudtG7QwFTrDBRjdLe5qj2my',
            },
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1N4NfnYmJucXYkuPdvJG4Jxbz3TetCTqJc',
            },
          },
          feeBPS: 500,
          extraSlots: 41,
        },
      },
    },
    ghostnet: {
      rpc: 'https://rpc.ghostnet.teztnets.xyz',
      port: 443,
      network_id: '*',
      secretKey: accounts.dev.sk,
      pools: {
        0: {
          name: 'USDt/wTEZ',
          tickIndex: -1325,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1Bm3wGXRYUnrmbUSBbosZDUSFaWuZeBCev',
            },
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1L8ujeb25JWKa4yPB61ub4QG2NbaKfdJDK',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        1: {
          name: 'USDt/tzBTC',
          tickIndex: -100357,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1Bm3wGXRYUnrmbUSBbosZDUSFaWuZeBCev',
            },
          },
          tokenY: {
            fa12: 'KT1LJ4YjQkDkiPhazyV7PizE1t59K5wNGxLA',
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        2: {
          name: 'tzBTC/wTEZ',
          tickIndex: 98860,
          tokenX: {
            fa12: 'KT1LJ4YjQkDkiPhazyV7PizE1t59K5wNGxLA',
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1L8ujeb25JWKa4yPB61ub4QG2NbaKfdJDK',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        3: {
          name: 'QUIPU/wTEZ',
          tickIndex: -11263,
          tokenX: {
            fa12: 'KT1GG8Zd5rUp1XV8nMPRBY2tSyVn6NR5F4Q1',
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1L8ujeb25JWKa4yPB61ub4QG2NbaKfdJDK',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
      },
    },
    mainnet: {
      rpc: 'https://mainnet.api.tez.ie',
      port: 443,
      network_id: '*',
      secretKey: accounts.mainnetDeployer.sk,
      pools: {
        0: {
          name: 'USDt/wTEZ',
          tickIndex: -1325,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1XnTn74bUtxHfDtBmm2bGZAQfhPbvKWR8o',
            },
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        1: {
          name: 'USDt/tzBTC',
          tickIndex: -100357,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1XnTn74bUtxHfDtBmm2bGZAQfhPbvKWR8o',
            },
          },
          tokenY: {
            fa12: 'KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn',
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        2: {
          name: 'tzBTC/wTEZ',
          tickIndex: 98860,
          tokenX: {
            fa12: 'KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn',
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        3: {
          name: 'QUIPU/wTEZ',
          tickIndex: -11263,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT193D4vozYnhGJQVtw7CoxxqphqUEEwK6Vb',
            },
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
      },
    },
  },
};
