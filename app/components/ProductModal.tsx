'use client'
import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BrowserProvider, parseEther, Contract } from "ethers"
import Toast from "./Toast"
import MarketplaceAbi from "@/build/contracts/Marketplace.json"

interface ProductModalProps {
  open: boolean
  onClose: () => void
  product: any | null
}

const EXPECTED_CHAIN_ID = process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID
  ? BigInt(process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID)
  : undefined

const ProductModal: React.FC<ProductModalProps> = ({ open, onClose, product }) => {
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<any | null>(null)

  if (!open || !product) return null

  const handleBuy = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setToast({ message: "Wallet not detected.", type: "error" })
      return
    }

    if (!product?.priceEth || Number(product.priceEth) <= 0) {
      setToast({ message: "Invalid product price.", type: "error" })
      return
    }

    if (!product?.listingId) {
      setToast({ message: "Listing ID tidak ditemukan.", type: "error" })
      return
    }

    const marketplaceAddress = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS
    if (!marketplaceAddress) {
      setToast({ message: "Marketplace address belum di-set.", type: "error" })
      return
    }

    try {
      setLoading(true)

      const provider = new BrowserProvider((window as any).ethereum)
      const network = await provider.getNetwork()

      if (EXPECTED_CHAIN_ID && network.chainId !== EXPECTED_CHAIN_ID) {
        setToast({
          message: `Wrong network. Please switch to chain ID ${EXPECTED_CHAIN_ID.toString()}.`,
          type: "error",
        })
        return
      }

      const signer = await provider.getSigner()

      const marketplace = new Contract(marketplaceAddress, MarketplaceAbi.abi, signer)

      const quantity = 1n // untuk saat ini beli 1 unit
      const value = parseEther(String(product.priceEth))

      const tx = await marketplace.purchase(product.listingId, quantity, { value })

      await tx.wait()

      setToast({ message: "Order berhasil dibuat via Escrow.", type: "success" })
    } catch (err: any) {
      console.log("TX ERROR:", err)

      if (err?.code === 4001) {
        setToast({ message: "Transaction was cancelled.", type: "error" })
      } else if (err?.message?.toLowerCase().includes("insufficient")) {
        setToast({ message: "Insufficient balance.", type: "error" })
      } else if (err?.message?.toLowerCase().includes("network")) {
        setToast({ message: "Network error. Try again.", type: "error" })
      } else {
        setToast({ message: "Transaction failed.", type: "error" })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex justify-center items-center z-50 p-4"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-white w-full max-w-md rounded-2xl p-5 shadow-xl text-black"
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{product.name}</h2>
              <button
                onClick={onClose}
                className="text-black hover:text-black/60 text-lg"
                aria-label="Close"
              >
                X
              </button>
            </div>

            <img src={product.image} className="w-full h-48 object-cover rounded-lg mb-4" />

            <div className="space-y-1 text-black">
              <p>
                <span className="font-semibold">Origin:</span> {product.origin}
              </p>
              <p>
                <span className="font-semibold">Process:</span> {product.process}
              </p>
              <p>
                <span className="font-semibold">Notes:</span> {product.notes}
              </p>
              <p className="font-semibold mt-3 text-lg">{product.priceEth} ETH</p>
            </div>

            <div className="mt-4 bg-gray-100 p-3 rounded-lg text-sm text-black">
              <p>
                <span className="font-semibold">Harvested:</span> {product.timeline.harvested}
              </p>
              <p>
                <span className="font-semibold">Roasted:</span> {product.timeline.roasted}
              </p>
              <p>
                <span className="font-semibold">Packed:</span> {product.timeline.packed}
              </p>
            </div>

            <button
              onClick={handleBuy}
              disabled={loading}
              className={`w-full mt-5 py-3 rounded-xl text-white font-semibold transition 
                ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {loading ? "Processing..." : "Buy Now"}
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}

export default ProductModal
