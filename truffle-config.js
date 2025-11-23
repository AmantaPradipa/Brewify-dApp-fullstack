module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",      // localhost
      port: 7545,             // default Ganache GUI port
      network_id: "*"         // match any network id
    }
  },
  compilers: {
    solc: {
      version: "0.8.19",     // sesuai pragma contract
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: "london"
      }
    }
  }
};
