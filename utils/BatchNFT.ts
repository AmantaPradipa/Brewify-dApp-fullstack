// utils/BatchNFT.ts
import { ethers } from "ethers";
import BatchNFTAbi from "../build/contracts/BatchNFT.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BATCHNFT_ADDRESS!;

// Helper buat dapetin provider & signer
const getProviderAndSigner = async () => {
  let provider: ethers.JsonRpcProvider | ethers.BrowserProvider;
  let signer: ethers.Signer | undefined;

  // MetaMask tersedia -> pakai transaksi
  if (typeof window !== "undefined" && (window as any).ethereum) {
    provider = new ethers.BrowserProvider((window as any).ethereum);
    signer = await provider.getSigner();
  } 
  // Kalau ga ada MetaMask, pakai RPC read-only
  else if (process.env.NEXT_PUBLIC_RPC_URL) {
    provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
    signer = undefined;
  } 
  else {
    throw new Error("Provide MetaMask or NEXT_PUBLIC_RPC_URL");
  }

  return { provider, signer };
};

// Helper buat dapetin instance contract
const getContract = async (withSigner = false) => {
  const { provider, signer } = await getProviderAndSigner();
  if (withSigner && !signer) throw new Error("Signer required for transactions");
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    BatchNFTAbi.abi,
    withSigner ? signer : provider
  );
  return contract;
};

// ============================
// TRANSACTIONS (MetaMask)
// ============================
export const mintBatch = async (to: string, ipfsHash: string) => {
  const contract = await getContract(true);
  const tx = await contract.mintBatch(to, ipfsHash);
  return tx.wait();
};

export const updateBatchStatus = async (tokenId: number, status: number) => {
  const contract = await getContract(true);
  const signer = contract.signer;
  if (!signer) throw new Error("Signer is required to update status");

  const tx = await contract.updateBatchStatus(tokenId, status);
  return tx.wait();
};

// ============================
// READ-ONLY (RPC)
// ============================
export const getBatchMetadata = async (tokenId: number) => {
  const contract = await getContract(false);
  // di BatchNFT baru, metadata disimpan di tokenURI (ERC721URIStorage)
  return contract.tokenURI(tokenId);
};

export const getBatchStatus = async (tokenId: number) => {
  const contract = await getContract(false);
  // status enum diambil dari fungsi getStatus
  return contract.getStatus(tokenId);
};
