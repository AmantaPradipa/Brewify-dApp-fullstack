"use client";

import { useState } from "react";
import { ethers } from "ethers";
import BatchNFTAbi from "@/build/contracts/BatchNFT.json";
import MarketplaceAbi from "@/build/contracts/Marketplace.json";
import { QRCodeCanvas } from "qrcode.react";
import Toast from "@/app/components/Toast";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";

// Ambil alamat kontrak dari environment agar selalu sesuai hasil deploy
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BATCHNFT_ADDRESS as string;
const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as string;
const EXPECTED_CHAIN_ID = process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID
  ? BigInt(process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID)
  : undefined;

export default function MintingNFT() {
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [minting, setMinting] = useState(false);
  const [tokenId, setTokenId] = useState<number | null>(null);
  const [batchMetadata, setBatchMetadata] = useState("");
  const [batchStatus, setBatchStatus] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [form, setForm] = useState({
    name: "",
    origin: "",
    process: "",
    description: "",
    priceEth: "",
    quantity: "",
    harvested: "",
    roasted: "",
    packed: "",
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0]);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [e.target.name]: e.target.value });
  const showToast = (message: string, type: "success" | "error" = "error") => setToast({ message, type });


  const handleMint = async () => {
    // Validasi semua field wajib
    const requiredFields = ["name", "origin", "process", "description", "priceEth", "quantity", "harvested", "roasted", "packed"];
    for (const field of requiredFields) {
      if (!form[field as keyof typeof form]) {
        return showToast(`Field "${field}" wajib diisi!`);
      }
    }

      if (!file) return showToast("Select a file first!");

      setMinting(true);
      try {
      if (!MARKETPLACE_ADDRESS) {
        throw new Error("Marketplace address belum di-set di .env");
      }

      // Konversi harga & stok ke tipe on-chain
      let priceWei: bigint;
      let stock: bigint;
      try {
        priceWei = ethers.parseEther(form.priceEth);
        stock = BigInt(form.quantity);
        if (stock <= 0n) throw new Error();
      } catch {
        throw new Error("Harga atau quantity tidak valid");
      }

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.cid) throw new Error("IPFS upload failed");
      const imageIpfs = `ipfs://${data.cid}`;

      // Bentuk metadata JSON dan upload ke IPFS
      const metadata = {
        name: form.name,
        description: form.description,
        image: imageIpfs,
        attributes: [
          { trait_type: "Origin", value: form.origin },
          { trait_type: "Process", value: form.process },
          { trait_type: "Harvested", value: form.harvested },
          { trait_type: "Roasted", value: form.roasted },
          { trait_type: "Packed", value: form.packed },
          { trait_type: "Price (ETH)", value: form.priceEth },
          { trait_type: "Quantity", value: form.quantity },
        ],
      };

      const metaRes = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
      const metaData = await metaRes.json();
      if (!metaRes.ok || !metaData.cid) throw new Error("Metadata upload failed");
      const tokenUri = `ipfs://${metaData.cid}`;

      if (!window.ethereum) throw new Error("Install MetaMask first");
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const network = await provider.getNetwork();
      if (EXPECTED_CHAIN_ID && network.chainId !== EXPECTED_CHAIN_ID) {
        throw new Error(
          `Wrong network. Please switch wallet to chain ID ${EXPECTED_CHAIN_ID.toString()}`
        );
      }
      const signer = await provider.getSigner();
      const to = await signer.getAddress();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, BatchNFTAbi.abi, signer);
      const tx = await contract.mintBatch(to, tokenUri);
      const receipt = await tx.wait();

      // ethers v6 tidak selalu menambahkan field "events", jadi kita parse logs manual
      let mintedTokenId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed.name === "BatchMinted") {
            mintedTokenId = Number(parsed.args.tokenId);
            break;
          }
        } catch {
          // abaikan log yang bukan milik BatchNFT
        }
      }

      if (mintedTokenId === null) {
        throw new Error("BatchMinted event not found");
      }

      // Setelah NFT berhasil di-mint, otomatis buat listing di Marketplace
      try {
        const marketplace = new ethers.Contract(
          MARKETPLACE_ADDRESS,
          MarketplaceAbi.abi,
          signer
        );

        const listingTx = await marketplace.createListing(priceWei, mintedTokenId, stock, tokenUri);
        await listingTx.wait();
      } catch (err) {
        console.error("Create listing failed:", err);
        showToast(
          "Mint berhasil tetapi gagal membuat listing di marketplace (cek role Farmer & gas).",
          "error"
        );
      }

      setTokenId(mintedTokenId);
      // baca metadata & status dari kontrak versi terbaru
      const meta = await contract.tokenURI(mintedTokenId);
      const status = await contract.getStatus(mintedTokenId);
      setBatchMetadata(meta);
      setBatchStatus(Number(status));

      showToast("Batch NFT berhasil di-mint!", "success");
    } catch (err) {
      console.error("Mint failed:", err);
      showToast("Minting gagal: " + (err as Error).message, "error");
    } finally {
      setMinting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center py-10 px-4">
      {/* Back button */}
      <div className="w-full max-w-6xl mb-6">
        <button
          onClick={() => router.push('/farmer')}
          className="flex items-center gap-2 p-2 border border-gray-300 rounded-xl hover:bg-gray-100"
        >
          <ArrowLeft size={16} />
          <span className="cursor-pointer text-sm font-medium">Kembali</span>
        </button>
      </div>
      <div className="w-full max-w-6xl flex gap-8">
        {/* Left: Form */}
        <div className="border border-gray-300 rounded-xl p-6 flex-1 flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-gray-800 text-center">Mint New Batch NFT</h1>

          <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Batch Name" className="p-3 border border-gray-300 rounded-lg" />
          <input type="text" name="origin" value={form.origin} onChange={handleChange} placeholder="Origin" className="p-3 border border-gray-300 rounded-lg" />
          <input type="text" name="process" value={form.process} onChange={handleChange} placeholder="Process (Natural/Washed/etc)" className="p-3 border border-gray-300 rounded-lg" />
          <textarea name="description" value={form.description} onChange={handleChange} placeholder="Description" className="p-3 border border-gray-300 rounded-lg" />
          <input type="number" step="0.001" name="priceEth" value={form.priceEth} onChange={handleChange} placeholder="Price (ETH)" className="p-3 border border-gray-300 rounded-lg" />
          <input type="number" name="quantity" value={form.quantity} onChange={handleChange} placeholder="Quantity" className="p-3 border border-gray-300 rounded-lg" />

          {/* Timeline */}
          <div className="flex flex-col gap-2">
            <label className="font-medium text-gray-700">Timeline</label>
            <div className="flex gap-2">
              <div className="flex flex-col w-full">
                <label htmlFor="harvested" className="text-sm text-gray-500">
                  Harvested
                </label>
                <input
                  id="harvested"
                  type="date"
                  name="harvested"
                  value={form.harvested}
                  onChange={handleChange}
                  className="p-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex flex-col w-full">
                <label htmlFor="roasted" className="text-sm text-gray-500">
                  Roasted
                </label>
                <input
                  id="roasted"
                  type="date"
                  name="roasted"
                  value={form.roasted}
                  onChange={handleChange}
                  className="p-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex flex-col w-full">
                <label htmlFor="packed" className="text-sm text-gray-500">
                  Packed
                </label>
                <input
                  id="packed"
                  type="date"
                  name="packed"
                  value={form.packed}
                  onChange={handleChange}
                  className="p-3 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          <button onClick={handleMint} disabled={minting} className={`w-full py-3 rounded-lg font-semibold text-white transition ${minting ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}>
            {minting ? "Minting..." : "Mint Batch NFT"}
          </button>
        </div>

        {/* Right: Image + File Input + QR Code */}
        <div className="flex-1 flex flex-col items-center gap-4">
          {/* Preview */}
          {file ? (
            <img src={URL.createObjectURL(file)} alt="Batch Preview" className="w-full h-96 object-cover rounded-lg shadow-lg" />
          ) : (-
            <div className="w-full h-96 border-2 border-gray-200 rounded-lg flex justify-center items-center text-gray-400">
              Image Preview
            </div>
          )}

          {/* File input */}
          <div className="w-full">
            <label className="cursor-pointer flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-gray-400 transition text-gray-500 text-center">
              <Upload size={24} />
              <span>{file ? file.name : "Choose file"}</span>
              <input type="file" onChange={handleFileChange} className="hidden" />
            </label>
          </div>

          {/* QR Code */}
          <div className="w-full h-64 border border-gray-200 rounded-lg flex items-center justify-center">
            {tokenId ? (
              <QRCodeCanvas value={`https://example.com/token/${tokenId}`} size={150} />
            ) : (
              <span className="text-gray-400">QR Code Akan Muncul disini</span>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
