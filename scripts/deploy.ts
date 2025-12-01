import "dotenv/config";
import { ethers } from "ethers";
import UserProfile from "../build/contracts/UserProfile.json";

async function main() {
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL!;
    const privateKey = process.env.PRIVATE_KEY!;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const factory = new ethers.ContractFactory(
        UserProfile.abi,
        UserProfile.bytecode,
        wallet
    );

    const contract = await factory.deploy();
    await contract.waitForDeployment();

    console.log("UserProfile deployed at:", contract.target);
}

main().catch(console.error);