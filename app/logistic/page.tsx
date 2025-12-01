'use client'
import React, { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ethers } from 'ethers'
import useWallet from '@/hooks/useWallet'
import MarketplaceAbi from '@/build/contracts/Marketplace.json'
import BatchNFTAbi from '@/build/contracts/BatchNFT.json'
import EscrowAbi from '@/build/contracts/Escrow.json'

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as string
const BATCHNFT_ADDRESS = process.env.NEXT_PUBLIC_BATCHNFT_ADDRESS as string
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as string
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL as string
const GATEWAY_URL =
  (process.env.NEXT_PUBLIC_GATEWAY_URL as string) || 'https://gateway.pinata.cloud/ipfs'

type LogisticsStatus = 'Awaiting Shipment' | 'On The Way' | 'Arrived'

interface LogisticsOrder {
  id: number
  escrowId: bigint
  tokenId: bigint
  name: string
  origin: string
  process: string
  priceEth: number
  quantity: number
  status: LogisticsStatus
  canUpdate: boolean
}

const statusStyles: Record<LogisticsStatus, { color: string; blink?: boolean }> = {
  'Awaiting Shipment': { color: 'bg-yellow-400', blink: true },
  'On The Way': { color: 'bg-blue-400' },
  Arrived: { color: 'bg-green-500' },
}

const allowedTransitions: Record<LogisticsStatus, LogisticsStatus[]> = {
  'Awaiting Shipment': ['On The Way', 'Arrived'],
  'On The Way': ['Arrived'],
  Arrived: [],
}

const LogisticsPage = () => {
  const router = useRouter()
  const { address, connect, signer, wrongNetwork, expectedChainId } = useWallet()

  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<LogisticsOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [dropdownOpenId, setDropdownOpenId] = useState<number | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<LogisticsOrder | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<LogisticsStatus | null>(null)

  useEffect(() => {
    if (!address) {
      connect()
    }
  }, [address, connect])

  useEffect(() => {
    const loadOrders = async () => {
      if (
        !RPC_URL ||
        !MARKETPLACE_ADDRESS ||
        !BATCHNFT_ADDRESS ||
        !ESCROW_ADDRESS ||
        !address
      )
        return

      try {
        setLoading(true)

        const provider = new ethers.JsonRpcProvider(RPC_URL)
        const market = new ethers.Contract(MARKETPLACE_ADDRESS, MarketplaceAbi.abi, provider)
        const batch = new ethers.Contract(BATCHNFT_ADDRESS, BatchNFTAbi.abi, provider)
        const escrow = new ethers.Contract(ESCROW_ADDRESS, EscrowAbi.abi, provider)

        const gatewayBase = GATEWAY_URL.replace(/\/$/, '')
        const events = await market.queryFilter('Purchased', 0n, 'latest')

        const items: LogisticsOrder[] = []

        for (const ev of events as any[]) {
          const listingId = ev.args.listingId as bigint
          const escrowId = ev.args.escrowId as bigint
          const tokenId = ev.args.tokenId as bigint
          const quantity = ev.args.quantity as bigint

          const [, price, , , uri] = await market.getListing(listingId)

          let metadataUri: string = uri
          if (!metadataUri || metadataUri.length === 0) {
            try {
              metadataUri = await batch.tokenURI(tokenId)
            } catch {
              // ignore
            }
          }

          let name = `Batch #${tokenId}`
          let origin = ''
          let processName = ''

          if (metadataUri && metadataUri.startsWith('ipfs://')) {
            const cid = metadataUri.replace('ipfs://', '')
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
                  attrs.find((a) => a?.trait_type === key)?.value ?? ''

                origin = findAttr('Origin')
                processName = findAttr('Process')
              }
            } catch {
              // ignore metadata error
            }
          }

          // Status dan apakah logistics yang login boleh meng-update order ini
          let status: LogisticsStatus = 'Awaiting Shipment'
          let canUpdate = false

          try {
            const shipping = await escrow.getShipping(escrowId)
            const logisticsAddr = (shipping[0] || '') as string
            const rawStatus = Number(shipping[2] || 0) // ShippingStatus enum

            const zeroAddress = '0x0000000000000000000000000000000000000000'

            if (address) {
              const addrLower = address.toLowerCase()
              const logisticsLower = logisticsAddr?.toLowerCase()

              // Jika belum ada logistics tercatat (zero address), izinkan
              // logistics yang login untuk meng-claim order ini.
              if (!logisticsAddr || logisticsLower === zeroAddress) {
                canUpdate = true
              } else if (logisticsLower === addrLower) {
                canUpdate = true
              }
            }

            if (rawStatus === 3) status = 'Arrived'
            else if (rawStatus === 2) status = 'On The Way'
            else if (rawStatus === 1) status = 'Awaiting Shipment'
          } catch {
            // jika belum ada data shipping, biarkan status default (Awaiting Shipment)
          }

          const priceEth = Number(ethers.formatEther(price))

          items.push({
            id: Number(escrowId),
            escrowId,
            tokenId,
            name,
            origin,
            process: processName,
            priceEth,
            quantity: Number(quantity),
            status,
            canUpdate,
          })
        }

        setOrders(items)
      } catch (err) {
        console.error('Gagal load logistics orders:', err)
      } finally {
        setLoading(false)
      }
    }

    loadOrders()
  }, [address])

  const handleOpenDropdown = (id: number) =>
    setDropdownOpenId(prev => (prev === id ? null : id))

  const handleSelectStatus = (order: LogisticsOrder, status: LogisticsStatus) => {
    setSelectedOrder(order)
    setSelectedStatus(status)
    setModalOpen(true)
    setDropdownOpenId(null)
  }

  const handleConfirmUpdate = async () => {
    if (!selectedOrder || !selectedStatus) return

    try {
      if (!signer) {
        await connect()
        if (!signer) return
      }

      if (wrongNetwork) return
      if (!ESCROW_ADDRESS) return

      const escrow = new ethers.Contract(ESCROW_ADDRESS, EscrowAbi.abi, signer!)

      const current = selectedOrder.status
      const next = selectedStatus

      if (current === next) return

      if (current === 'Awaiting Shipment' && next === 'On The Way') {
        const tx = await escrow.logisticsMarkOnTheWay(selectedOrder.escrowId)
        await tx.wait()
      } else if (
        (current === 'Awaiting Shipment' || current === 'On The Way') &&
        next === 'Arrived'
      ) {
        // jika dari Awaiting langsung ke Arrived, set OnTheWay dulu di chain
        if (current === 'Awaiting Shipment') {
          const tx1 = await escrow.logisticsMarkOnTheWay(selectedOrder.escrowId)
          await tx1.wait()
        }
        const tx2 = await escrow.logisticsMarkArrived(selectedOrder.escrowId)
        await tx2.wait()
      } else {
        return
      }

      setOrders(prev =>
        prev.map(order =>
          order.id === selectedOrder.id ? { ...order, status: next } : order,
        ),
      )

      setModalOpen(false)
      setSelectedOrder(null)
      setSelectedStatus(null)
    } catch (err) {
      console.error('Gagal update status logistics:', err)
    }
  }

  const filteredOrders = orders.filter(order =>
    order.name.toLowerCase().includes(search.toLowerCase()),
  )

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
        <h1 className="text-xl font-bold">Logistics Dashboard</h1>
      </div>

      {wrongNetwork && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span className="font-semibold">Wrong network:</span>{' '}
          Please switch your wallet to chain ID{' '}
          {expectedChainId ? expectedChainId.toString() : 'the configured network'}.
        </div>
      )}

      {/* Search Bar */}
      <input
        type="text"
        placeholder="Search orders..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {/* Orders Table */}
      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full border-collapse border border-gray-300 rounded-md">
          <thead className="bg-gray-100 text-left font-light text-sm">
            <tr>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Nama Batch</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Origin</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Process</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Harga (ETH)</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Qty</th>
              <th className="p-3 border border-gray-300 font-medium text-gray-400">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center p-4 text-gray-500">
                  Loading orders...
                </td>
              </tr>
            )}

            {!loading && filteredOrders.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center p-4 text-gray-500">
                  No orders found.
                </td>
              </tr>
            )}

            {!loading &&
              filteredOrders.map(order => {
                const style = statusStyles[order.status] || { color: 'bg-gray-400' }
                const options = order.canUpdate ? allowedTransitions[order.status] ?? [] : []

                return (
                  <tr key={order.id} className="text-sm border border-gray-300">
                    <td className="p-3 border border-gray-300 font-medium">{order.name}</td>
                    <td className="p-3 border border-gray-300">{order.origin}</td>
                    <td className="p-3 border border-gray-300">{order.process}</td>
                    <td className="p-3 border border-gray-300 font-semibold">
                      {order.priceEth} ETH
                    </td>
                    <td className="p-3 border border-gray-300">{order.quantity}</td>
                    <td className="p-3 border-gray-300 relative flex items-center gap-2">
                      <button
                        onClick={() => handleOpenDropdown(order.id)}
                        className="flex items-center justify-between w-40 px-3 py-2 text-sm border border-gray-300 rounded-full cursor-pointer bg-white hover:bg-gray-50"
                        disabled={options.length === 0}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block w-3 h-3 rounded-full ${style.color} ${
                              style.blink ? 'animate-blink' : ''
                            }`}
                          ></span>
                          {order.status}
                        </span>
                        <ChevronDown size={16} />
                      </button>

                      <AnimatePresence>
                        {dropdownOpenId === order.id && options.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-12 left-0 w-48 bg-white border border-gray-300 rounded-md shadow-lg z-10"
                          >
                            {options.map(statusOption => (
                              <div
                                key={statusOption}
                                className="p-2 cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSelectStatus(order, statusOption)}
                              >
                                {statusOption}
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {modalOpen && selectedOrder && selectedStatus && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-opacity-40 backdrop-blur-sm"></div>
            <motion.div
              className="border border-gray-300 bg-white p-6 rounded-xl w-80 flex flex-col gap-4 z-10"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <h2 className="text-lg font-bold">Confirm Status Update</h2>
              <p>
                Are you sure you want to update{' '}
                <span className="font-medium">{selectedOrder.name}</span> to{' '}
                <span className="font-medium">{selectedStatus}</span>?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmUpdate}
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

export default LogisticsPage
