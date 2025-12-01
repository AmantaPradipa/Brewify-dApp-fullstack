const UserProfile = artifacts.require("UserProfile");
const BatchNFT = artifacts.require("BatchNFT");
const Escrow = artifacts.require("Escrow");
const Marketplace = artifacts.require("Marketplace");

module.exports = async function (deployer) {
  // Deploy user profile registry
  await deployer.deploy(UserProfile);
  const userProfile = await UserProfile.deployed();

  // Ambil instance kontrak yang sudah dideploy di migration sebelumnya
  const batchNFT = await BatchNFT.deployed();
  const escrow = await Escrow.deployed();

  // Set UserProfile sebagai registry role untuk BatchNFT
  await batchNFT.setUserProfile(userProfile.address);

  // Deploy marketplace utama
  const feeBps = 250; // harus konsisten dengan snapshot fee di Escrow
  await deployer.deploy(
    Marketplace,
    escrow.address,
    batchNFT.address,
    userProfile.address,
    feeBps
  );

  const marketplace = await Marketplace.deployed();

  // Izinkan marketplace membuat escrow di kontrak Escrow
  await escrow.setApprovedMarketplace(marketplace.address, true);
};
