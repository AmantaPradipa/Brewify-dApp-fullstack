const BatchNFT = artifacts.require("BatchNFT");
const Escrow = artifacts.require("Escrow");

module.exports = async function (deployer, network, accounts) {
  await deployer.deploy(BatchNFT);
  const feeRecipient = accounts[0];
  const feeBps = 250; // 2.5% fee snapshot, bisa diubah nanti kalau perlu

  await deployer.deploy(Escrow, feeRecipient, feeBps);
};
