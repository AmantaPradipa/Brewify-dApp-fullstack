"use client";

import { useState } from "react";
import { ethers } from "ethers";
import BatchNFTAbi from "@/build/contracts/BatchNFT.json";
import { updateBatchStatus } from "@/utils/BatchNFT";
import { QRCodeCanvas } from "qrcode.react";
import Toast from "@/app/components/Toast";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";

const CONTRACT_ADDRESS = "0x4A1628B149b78F4b04820f5fe9B29b2F30c0cA46";

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
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.cid) throw new Error("IPFS upload failed");
      const ipfsHash = `ipfs://${data.cid}`;

      if (!window.ethereum) throw new Error("Install MetaMask first");
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const to = await signer.getAddress();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, BatchNFTAbi.abi, signer);
      const tx = await contract.mintBatch(to, ipfsHash);
      const receipt = await tx.wait();

      const event = receipt.events?.find((e: any) => e.event === "BatchMinted");
      if (!event) throw new Error("BatchMinted event not found");
      const id = Number(event.args.tokenId);

      setTokenId(id);
      const meta = await contract.batchMetadata(id);
      const status = await contract.batchStatus(id);
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
                <span className="text-sm text-gray-500">Harvested</span>
                <input type="date" name="harvested" value={form.harvested} onChange={handleChange} className="p-3 border border-gray-300 rounded-lg" />
              </div>
              <div className="flex flex-col w-full">
                <span className="text-sm text-gray-500">Roasted</span>
                <input type="date" name="roasted" value={form.roasted} onChange={handleChange} className="p-3 border border-gray-300 rounded-lg" />
              </div>
              <div className="flex flex-col w-full">
                <span className="text-sm text-gray-500">Packed</span>
                <input type="date" name="packed" value={form.packed} onChange={handleChange} className="p-3 border border-gray-300 rounded-lg" />
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
          ) : (
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
