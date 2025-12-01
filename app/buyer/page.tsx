"use client"
import React, { useEffect, useState } from "react"
import { ArrowLeft, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ethers } from "ethers"
import useWallet from "@/hooks/useWallet"
import MarketplaceAbi from "@/build/contracts/Marketplace.json"
import EscrowAbi from "@/build/contracts/Escrow.json"
import BatchNFTAbi from "@/build/contracts/BatchNFT.json"

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as string
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as string
const BATCHNFT_ADDRESS = process.env.NEXT_PUBLIC_BATCHNFT_ADDRESS as string
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL as string
const GATEWAY_URL =
  (process.env.NEXT_PUBLIC_GATEWAY_URL as string) || "https://gateway.pinata.cloud/ipfs"

type OrderStatus = "Awaiting Shipment" | "On The Way" | "Arrived"

interface Order {
  id: number
  escrowId: bigint
  listingId: bigint
  tokenId: bigint
  name: string
  origin: string
  process: string
  priceEth: number
  quantity: number
  status: OrderStatus
  released: boolean
}

const statusStyles: Record<
  OrderStatus,
  { color: string; glow?: string; blink?: boolean }
> = {
  "Awaiting Shipment": {
    color: "bg-yellow-400",
    glow: "shadow-[0_0_8px_2px_rgba(251,191,36,0.6)]",
    blink: true,
  },
  "On The Way": {
    color: "bg-blue-400",
    glow: "shadow-[0_0_6px_2px_rgba(59,130,246,0.5)]",
  },
  Arrived: {
    color: "bg-green-500",
    glow: "shadow-[0_0_6px_2px_rgba(34,197,94,0.5)]",
  },
}

const BuyerPage = () => {
  const router = useRouter()
  const { address, connect, signer, wrongNetwork, expectedChainId } = useWallet()

  const [search, setSearch] = useState("")
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState<boolean | null>(null)

  useEffect(() => {
    if (!address) {
      connect()
    }
  }, [address, connect])

  useEffect(() => {
    const loadOrders = async () => {
      if (!address || !RPC_URL || !MARKETPLACE_ADDRESS || !ESCROW_ADDRESS || !BATCHNFT_ADDRESS) {
        return
      }

      try {
        setLoadingOrders(true)

        const provider = new ethers.JsonRpcProvider(RPC_URL)
        const market = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceAbi.abi, provider)
        const escrow = new ethers.Contract(ESCROW_ADDRESS, EscrowAbi.abi, provider)
        const batch = new ethers.Contract(BATCHNFT_ADDRESS, BatchNFTAbi.abi, provider)

        const gatewayBase = GATEWAY_URL.replace(/\/$/, "")

        const filter = (market.filters as any).Purchased(null, null, address)
        const events = await market.queryFilter(filter, 0n, "latest")

        const items: Order[] = []

        for (const ev of events as any[]) {
          const listingId = ev.args.listingId as bigint
          const escrowId = ev.args.escrowId as bigint
          const tokenId = ev.args.tokenId as bigint
          const quantity = ev.args.quantity as bigint

          const [, price, , , uri] = await market.getListing(listingId)
          const [, , , , , , , , released] = await escrow.getEscrow(escrowId)

          let metadataUri: string = uri

          if (!metadataUri || metadataUri.length === 0) {
            try {
              metadataUri = await batch.tokenURI(tokenId)
            } catch {
              // ignore
            }
          }

          let name = `Batch #${tokenId}`
          let origin = ""
          let processName = ""
          let imageUrl = metadataUri || ""

          if (metadataUri && metadataUri.startsWith("ipfs://")) {
            const cid = metadataUri.replace("ipfs://", "")
            const metadataUrl = `${gatewayBase}/${cid}`

            try {
              const res = await fetch(metadataUrl)
              if (res.ok) {
                const json = await res.json()

                if (json?.name) name = json.name

                const attrs = Array.isArray(json?.attributes)
                  ? (json.attributes as any[])
                  : []
                const findAttr = (key: string) =>
                  attrs.find((a) => a?.trait_type === key)?.value ?? ""

                origin = findAttr("Origin")
                processName = findAttr("Process")

                const imageField = json?.image
                if (typeof imageField === "string") {
                  if (imageField.startsWith("ipfs://")) {
                    const imgCid = imageField.replace("ipfs://", "")
                    imageUrl = `${gatewayBase}/${imgCid}`
                  } else {
                    imageUrl = imageField
                  }
                } else {
                  imageUrl = metadataUrl
                }
              } else {
                imageUrl = metadataUrl
              }
            } catch {
              imageUrl = metadataUrl
            }
          }

          // Status tracking per-order berdasarkan ShippingStatus di Escrow.
          let status: OrderStatus = "Awaiting Shipment"

          try {
            const shipping = await escrow.getShipping(escrowId)
            const rawStatus = Number(shipping[2] || 0) // ShippingStatus enum

            if (rawStatus === 3) status = "Arrived"
            else if (rawStatus === 2) status = "On The Way"
            else status = "Awaiting Shipment"
          } catch {
            // jika belum ada data shipping, biarkan default
          }

          // Jika dana sudah dilepas dari escrow, selalu anggap Arrived.
          if (released) {
            status = "Arrived"
          }

          const priceEth = Number(ethers.formatEther(price))

          items.push({
            id: Number(escrowId),
            escrowId,
            listingId,
            tokenId,
            name,
            origin,
            process: processName,
            priceEth,
            quantity: Number(quantity),
            status,
            released,
          })
        }

        setOrders(items)
      } catch (err) {
        console.error("Gagal load orders buyer:", err)
      } finally {
        setLoadingOrders(false)
      }
    }

    loadOrders()
  }, [address])

  const filteredOrders = orders.filter(order =>
    order.name.toLowerCase().includes(search.toLowerCase()),
  )

  const handleConfirmClick = (order: Order) => {
    setSelectedOrder(order)
    setModalOpen(true)
    setPaymentSuccess(null)
    setProcessing(false)
  }

  const handlePayment = async () => {
    if (!selectedOrder) return

    try {
      setProcessing(true)

      if (!signer) {
        await connect()
        if (!signer) {
          setPaymentSuccess(false)
          return
        }
      }

      if (wrongNetwork) {
        setPaymentSuccess(false)
        return
      }

      if (!ESCROW_ADDRESS) {
        setPaymentSuccess(false)
        return
      }

      const escrow = new ethers.Contract(ESCROW_ADDRESS, EscrowAbi.abi, signer!)
      const tx = await escrow.confirmReceived(selectedOrder.escrowId)
      await tx.wait()

      setPaymentSuccess(true)
      setOrders(prev =>
        prev.map(order =>
          order.id === selectedOrder.id
            ? { ...order, released: true, status: "Arrived" }
            : order,
        ),
      )
    } catch (err) {
      console.error("Confirm payment failed:", err)
      setPaymentSuccess(false)
    } finally {
      setProcessing(false)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelectedOrder(null)
    setPaymentSuccess(null)
  }

  return (
    <div className="p-4 max-w-5xl mx-auto flex flex-col gap-6">
      {/* Top Bar */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 p-2 border border-gray-300 rounded-xl hover:bg-gray-100"
        >
          <ArrowLeft size={16} />
          <span className="cursor-pointer text-sm font-medium">Kembali</span>
        </button>
      </div>

      {wrongNetwork && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span className="font-semibold">Wrong network:</span>{" "}
          Please switch your wallet to chain ID{" "}
          {expectedChainId ? expectedChainId.toString() : "the configured network"}.
        </div>
      )}

      {/* Search Bar */}
      <input
        type="text"
        placeholder="Search your purchased coffee..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {/* Orders Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 rounded-md overflow-hidden">
          <thead className="bg-gray-100 text-left font-light text-sm">
            <tr>
              <th className="text-gray-400 p-3 border font-medium border-gray-300">
                Nama Batch
              </th>
              <th className="text-gray-400 p-3 border font-medium border-gray-300">Origin</th>
              <th className="text-gray-400 p-3 border font-medium border-gray-300">Process</th>
              <th className="text-gray-400 p-3 border font-medium border-gray-300">
                Harga (ETH)
              </th>
              <th className="text-gray-400 p-3 border font-medium border-gray-300">Qty</th>
              <th className="text-gray-400 p-3 border font-medium border-gray-300">Status</th>
              <th className="text-gray-400 p-3 border font-medium border-gray-300">Action</th>
            </tr>
          </thead>

          <tbody>
            {loadingOrders && (
              <tr>
                <td colSpan={7} className="text-center p-4 text-gray-500">
                  Loading your on-chain orders...
                </td>
              </tr>
            )}

            {!loadingOrders && filteredOrders.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center p-4 text-gray-500">
                  No orders found.
                </td>
              </tr>
            )}

            {!loadingOrders &&
              filteredOrders.map(order => {
                const style = statusStyles[order.status] || { color: "bg-gray-400" }
                const canConfirm =
                  order.status === "Arrived" && !order.released
                return (
                  <tr key={order.id} className="text-sm border border-gray-300">
                    <td className="p-3 border border-gray-300 font-medium">{order.name}</td>
                    <td className="p-3 border border-gray-300">{order.origin}</td>
                    <td className="p-3 border border-gray-300">{order.process}</td>
                    <td className="p-3 border border-gray-300 font-semibold">
                      {order.priceEth} ETH
                    </td>
                    <td className="p-3 border border-gray-300">{order.quantity}</td>

                    <td className="p-3 border border-gray-300">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${style.color} ${style.glow} ${
                          style.blink ? "animate-blink" : ""
                        }`}
                      ></span>
                      <span className="align-middle">{order.status}</span>
                    </td>

                    <td className="p-3 border border-gray-300">
                      {canConfirm ? (
                        <button
                          onClick={() => handleConfirmClick(order)}
                          className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 cursor-pointer"
                        >
                          Confirm
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs italic">
                          {order.released ? "Already released" : "No action"}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && selectedOrder && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-opacity-40 backdrop-blur-sm"></div>

            <motion.div
              className="bg-white border border-gray-300 p-6 rounded-xl w-80 flex flex-col gap-4 z-10"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              {!processing && paymentSuccess === null && (
                <>
                  <h2 className="text-lg font-bold">Confirm Payment</h2>
                  <p>
                    Are you sure you want to release ETH for{" "}
                    <span className="font-medium">{selectedOrder.name}</span>?
                  </p>
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePayment}
                      className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
                    >
                      Confirm
                    </button>
                  </div>
                </>
              )}

              {processing && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader2 className="animate-spin text-gray-700" size={32} />
                  <span>Processing payment...</span>
                </div>
              )}

              {!processing && paymentSuccess !== null && (
                <div className="flex flex-col items-center gap-2 py-4">
                  {paymentSuccess ? (
                    <CheckCircle className="text-green-600" size={32} />
                  ) : (
                    <XCircle className="text-red-600" size={32} />
                  )}
                  <span>{paymentSuccess ? "Payment successful!" : "Payment failed."}</span>
                  <button
                    onClick={closeModal}
                    className="mt-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        @keyframes blink {
          0%,
          50%,
          100% {
            opacity: 1;
          }
          25%,
          75% {
            opacity: 0.2;
          }
        }
        .animate-blink {
          animation: blink 3s infinite;
        }
      `}</style>
    </div>
  )
}

export default BuyerPage
