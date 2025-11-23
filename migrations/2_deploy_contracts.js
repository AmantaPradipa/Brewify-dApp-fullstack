const BatchNFT = artifacts.require("BatchNFT");

module.exports = function (deployer) {
  deployer.deploy(BatchNFT);
};
