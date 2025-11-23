// utils/config.ts
import { PinataSDK } from "pinata";

export const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.NEXT_PUBLIC_GATEWAY_URL,
});

// Upload file
export const uploadFileToIPFS = async (file: File) => {
  const data = new FormData();
  data.append("file", file);

  // Upload menggunakan SDK Pinata
  const result = await pinata.upload.public.file(file);
  // Convert CID ke public gateway URL
  const url = await pinata.gateways.public.convert(result.cid);
  return url;
};

// Upload JSON metadata (optional)
export const uploadJSONToIPFS = async (jsonData: object) => {
  try {
    const result = await pinata.upload.public.json(jsonData);
    const url = await pinata.gateways.public.convert(result.cid);
    return url;
  } catch (err) {
    console.error("IPFS JSON Upload failed:", err);
    throw err;
  }
};