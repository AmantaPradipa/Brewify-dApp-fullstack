import { ethers } from "ethers";
import UserProfileABI from "@/build/contracts/UserProfile.json";

export const getUserProfileContract = (providerOrSigner: any) => {
    const networks = UserProfileABI.networks as Record<string, any>; // FIX HERE

    const networkId = Object.keys(networks)[0];
    if (!networkId) throw new Error("UserProfile not deployed on this network");

    const address = networks[networkId].address;

    return new ethers.Contract(address, UserProfileABI.abi, providerOrSigner);
};