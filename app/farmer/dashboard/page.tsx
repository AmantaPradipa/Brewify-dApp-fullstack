'use client'
import React, { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ethers } from 'ethers'
import useWallet from '@/hooks/useWallet'
import MarketplaceAbi from '@/build/contracts/Marketplace.json'
import UserProfileAbi from '@/build/contracts/UserProfile.json'
import BatchNFTAbi from '@/build/contracts/BatchNFT.json'
import EscrowAbi from '@/build/contracts/Escrow.json'

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as string
const USERPROFILE_ADDRESS = process.env.NEXT_PUBLIC_USERPROFILE_ADDRESS as string
const BATCHNFT_ADDRESS = process.env.NEXT_PUBLIC_BATCHNFT_ADDRESS as string
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as string
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL as string

type ShipmentStatus = 'Harvested' | 'Roasted' | 'Packed'

interface Shipment {
  id: number
  escrowId: bigint
  tokenId: bigint
  buyer: string
  username: string
  product: string
  priceEth: number
  quantity: number
  status: ShipmentStatus
}

const statusStyles: Record<
  ShipmentStatus,
  { color: string; glow?: string; blink?: boolean }
> = {
  Harvested: {
    color: 'bg-yellow-400',
    glow: 'shadow-[0_0_8px_2px_rgba(251,191,36,0.6)]',
    blink: true,
  },
  Roasted: {
    color: 'bg-blue-400',
    glow: 'shadow-[0_0_6px_2px_rgba(59,130,246,0.5)]',
  },
  Packed: {
    color: 'bg-green-500',
    glow: 'shadow-[0_0_6px_2px_rgba(34,197,94,0.5)]',
  },
}

const FarmerShipment = () => {
  const router = useRouter()
  const { address, connect, signer, wrongNetwork, expectedChainId } = useWallet()

  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)

  useEffect(() => {
    if (!address) {
      connect()
    }
  }, [address, connect])

  useEffect(() => {
    const loadShipments = async () => {
      if (!address || !RPC_URL || !MARKETPLACE_ADDRESS || !ESCROW_ADDRESS || !BATCHNFT_ADDRESS)
        return

      try {
        setLoading(true)

        const provider = new ethers.JsonRpcProvider(RPC_URL)
        const market = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceAbi.abi, provider)
        const batch = new ethers.Contract(BATCHNFT_ADDRESS, BatchNFTAbi.abi, provider)
        const escrow = new ethers.Contract(ESCROW_ADDRESS, EscrowAbi.abi, provider)
        const userProfile = new ethers.Contract(
          USERPROFILE_ADDRESS,
          UserProfileAbi.abi,
          provider,
        )

        const events = await market.queryFilter('Purchased', 0n, 'latest')

        const items: Shipment[] = []

        for (const ev of events as any[]) {
          const listingId = ev.args.listingId as bigint
          const escrowId = ev.args.escrowId as bigint
          const buyer = ev.args.buyer as string
          const tokenId = ev.args.tokenId as bigint
          const quantity = ev.args.quantity as bigint

          const [seller, price] = await market.getListing(listingId)
          if (!seller || seller.toLowerCase() !== address.toLowerCase()) continue

          const [, , , , shipped, , , , released] = await escrow.getEscrow(escrowId)

          // Baca status produksi batch NFT (global per brand)
          let batchStatusNumber = 0
          try {
            const statusEnum = await batch.getStatus(tokenId)
            batchStatusNumber = Number(statusEnum)
          } catch {
            batchStatusNumber = 0
          }

          // Status yang ditampilkan di dashboard farmer adalah status per-order:
          // - Jika escrow sudah shipped / released -> Packed
          // - Jika belum shipped tapi batch sudah Roasted -> Roasted
          // - Jika batch masih awal -> Harvested
          let status: ShipmentStatus = 'Harvested'
          if (released || shipped) {
            status = 'Packed'
          } else if (batchStatusNumber >= 2) {
            status = 'Roasted'
          } else {
            status = 'Harvested'
          }

          let username = buyer
          try {
            const [, usernameFromChain, isRegistered] = await userProfile.getUser(buyer)
            if (isRegistered && usernameFromChain) {
              username = usernameFromChain
            } else {
              username = `${buyer.slice(0, 6)}...${buyer.slice(-4)}`
            }
          } catch {
            username = `${buyer.slice(0, 6)}...${buyer.slice(-4)}`
          }

          const priceEth = Number(ethers.formatEther(price))

          items.push({
            id: Number(escrowId),
            escrowId,
            tokenId,
            buyer,
            username,
            product: `Batch #${tokenId}`,
            priceEth,
            quantity: Number(quantity),
            status,
          })
        }

        setShipments(items)
      } catch (err) {
        console.error('Gagal load shipments farmer:', err)
      } finally {
        setLoading(false)
      }
    }

    loadShipments()
  }, [address])

  const handleOpenModal = (shipment: Shipment) => {
    setSelectedShipment(shipment)
    setModalOpen(true)
  }

  const handleConfirmPacking = async () => {
    if (!selectedShipment) return

    try {
      if (!signer) {
        await connect()
        if (!signer) return
      }

      if (wrongNetwork) return
      if (!BATCHNFT_ADDRESS || !ESCROW_ADDRESS) return

      const batch = new ethers.Contract(BATCHNFT_ADDRESS, BatchNFTAbi.abi, signer!)
      const escrow = new ethers.Contract(ESCROW_ADDRESS, EscrowAbi.abi, signer!)

      const currentStatus = selectedShipment.status

      let nextStatus: ShipmentStatus | null = null

      if (currentStatus === 'Harvested') {
        // Naikkan status produksi batch menjadi Roasted (sekali per brand).
        try {
          const statusEnum = await batch.getStatus(selectedShipment.tokenId)
          const statusNumber = Number(statusEnum)
          if (statusNumber < 2) {
            const tx = await batch.updateBatchStatus(selectedShipment.tokenId, 2) // Processed / Roasted
            await tx.wait()
          }
        } catch (err) {
          console.error('Gagal update status batch ke Roasted:', err)
        }

        nextStatus = 'Roasted'

        // Karena status produksi bersifat global per token,
        // update semua baris dengan tokenId yang sama menjadi Roasted.
        setShipments(prev =>
          prev.map(s =>
            s.tokenId === selectedShipment.tokenId ? { ...s, status: 'Roasted' } : s,
          ),
        )
      } else if (currentStatus === 'Roasted') {
        // Untuk satu order tertentu, "Packing" berarti menandai escrow sebagai shipped.
        try {
          const txEscrow = await escrow.markShipped(selectedShipment.escrowId)
          await txEscrow.wait()
        } catch (err) {
          console.error('Gagal memanggil markShipped pada Escrow:', err)
          return
        }

        nextStatus = 'Packed'

        setShipments(prev =>
          prev.map(s =>
            s.id === selectedShipment.id ? { ...s, status: 'Packed' } : s,
          ),
        )
      }

      if (!nextStatus) return

      setModalOpen(false)
      setSelectedShipment(null)
    } catch (err) {
      console.error('Gagal update status Packed:', err)
    }
  }

  return (
    <div className="p-4 max-w-5xl mx-auto flex flex-col gap-6">
      {/* Top Bar */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 p-2 border border-gray-300 rounded-xl hover:bg-gray-100"
        >
          <ArrowLeft size={16} />
          <span className="cursor-pointer text-sm font-medium">Kembali</span>
        </button>
        <h1 className="text-xl font-bold">Farmer Shipment Dashboard</h1>
      </div>

      {wrongNetwork && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span className="font-semibold">Wrong network:</span>{' '}
          Please switch your wallet to chain ID{' '}
          {expectedChainId ? expectedChainId.toString() : 'the configured network'}.
        </div>
      )}

      {/* Shipments Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 rounded-md overflow-hidden">
          <thead className="bg-gray-100 text-left font-light text-sm">
            <tr>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Username</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Product</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Price (ETH)</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Quantity</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Status</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="p-3 text-center text-gray-500">
                  Loading shipments...
                </td>
              </tr>
            )}

            {!loading && shipments.length === 0 && (
              <tr>
                <td colSpan={6} className="p-3 text-center text-gray-500">
                  No shipments found.
                </td>
              </tr>
            )}

            {!loading &&
              shipments.map(shipment => {
                const style = statusStyles[shipment.status] || { color: 'bg-gray-400' }
                return (
                  <tr key={shipment.id} className="text-sm border border-gray-300">
                    <td className="p-3 border border-gray-300 font-medium">
                      {shipment.username}
                    </td>
                    <td className="p-3 border border-gray-300">{shipment.product}</td>
                    <td className="p-3 border border-gray-300 font-semibold">
                      {shipment.priceEth}
                    </td>
                    <td className="p-3 border border-gray-300">{shipment.quantity}</td>
                    <td className="p-3 border border-gray-300">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${style.color} ${
                          style.glow || ''
                        } ${style.blink ? 'animate-blink' : ''}`}
                      ></span>
                      <span className="align-middle">{shipment.status}</span>
                    </td>
                    <td className="p-3 border border-gray-300">
                      {shipment.status === 'Packed' ? (
                        <span className="text-gray-400 text-xs italic">Packed</span>
                      ) : (
                        <button
                          onClick={() => handleOpenModal(shipment)}
                          className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                        >
                          {shipment.status === 'Harvested' ? 'Roasting' : 'Packing'}
                        </button>
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
        {modalOpen && selectedShipment && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop blur + opacity 40% */}
            <div className="absolute inset-0 bg-opacity-40 backdrop-blur-sm"></div>

            {/* Modal content */}
            <motion.div
              className="border border-gray-300 bg-white p-6 rounded-xl w-80 flex flex-col gap-4 z-10"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <h2 className="text-lg font-bold">
                Confirm{' '}
                {selectedShipment.status === 'Harvested'
                  ? 'Roasting'
                  : 'Packing'}
              </h2>
              <p>
                Are you sure you want to mark{' '}
                <span className="font-medium">{selectedShipment.product}</span> as{' '}
                <span className="font-medium">
                  {selectedShipment.status === 'Harvested' ? 'Roasted' : 'Packed'}
                </span>
                ?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPacking}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                >
                  Confirm
                </button>
              </div>
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

export default FarmerShipment
