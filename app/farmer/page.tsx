'use client'
import React, { useEffect, useState } from 'react'
import { ArrowLeft, MoreVertical, LayoutDashboard, Coffee } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ethers } from 'ethers'
import BatchNFT from '@/build/contracts/BatchNFT.json'
import Marketplace from '@/build/contracts/Marketplace.json'
import UserProfile from '@/build/contracts/UserProfile.json'
import useWallet from '@/hooks/useWallet'
import Toast from '@/app/components/Toast'

const BATCHNFT_ADDRESS = process.env.NEXT_PUBLIC_BATCHNFT_ADDRESS as string
const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as string
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL as string
const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL ||
  'https://gateway.pinata.cloud/ipfs') as string

const DashboardFarmer = () => {
  const router = useRouter()
  const { address, signer, connect } = useWallet()

  const [search, setSearch] = useState('')
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<any | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editQuantity, setEditQuantity] = useState('')

  const showToast = (message: string, type: 'success' | 'error' = 'error') =>
    setToast({ message, type })

  // Pastikan user sudah connect & ber-role Farmer
  useEffect(() => {
    const ensureFarmer = async () => {
      if (!address) {
        await connect()
        return
      }

      if (!signer) return

      try {
        const profile = new ethers.Contract(
          process.env.NEXT_PUBLIC_USERPROFILE_ADDRESS!,
          UserProfile.abi,
          signer
        )
        const { 0: roleNumber, 2: isRegistered } = await profile.getUser(address)
        const isFarmer = isRegistered && Number(roleNumber) === 2 // 2 = Farmer
        if (!isFarmer) {
          router.push('/')
        }
      } catch (err) {
        console.error('Gagal cek role farmer:', err)
      }
    }

    ensureFarmer()
  }, [address, signer, connect, router])

  // Load semua batch NFT yang dimiliki / dimint oleh farmer ini, lengkap dengan metadata IPFS + listing
  useEffect(() => {
    const loadBatches = async () => {
      if (!address || !BATCHNFT_ADDRESS) return

      try {
        setLoading(true)

        const provider =
          (signer && (signer as any).provider) || (RPC_URL && new ethers.JsonRpcProvider(RPC_URL))
        if (!provider) return

        const batchContract = new ethers.Contract(BATCHNFT_ADDRESS, BatchNFT.abi, provider)
        const marketContract =
          MARKETPLACE_ADDRESS && new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace.abi, provider)

        // filter BatchMinted(to == address)
        const filter = batchContract.filters.BatchMinted(address)
        const events = await batchContract.queryFilter(filter, 0n, 'latest')

        // Ambil semua listing yang pernah dibuat, untuk mapping harga & stok per tokenId
        const listingEvents =
          marketContract && (await marketContract.queryFilter('ListingCreated', 0n, 'latest'))

        const gatewayBase = GATEWAY_URL.replace(/\/$/, '')

        const items = await Promise.all(
          events.map(async (ev: any) => {
            const tokenIdBn = ev.args.tokenId as bigint
            const tokenId = Number(tokenIdBn)
            const uri = ev.args.uri as string

            let name = `Batch #${tokenId}`
            let origin = ''
            let processName = ''
            let notes = ''
            let timeline: {
              harvested?: string
              roasted?: string
              packed?: string
            } = {}
            let imageUrl = uri

            // Baca metadata JSON dari IPFS
            if (uri && uri.startsWith('ipfs://')) {
              const cid = uri.replace('ipfs://', '')
              const metadataUrl = `${gatewayBase}/${cid}`

              try {
                const res = await fetch(metadataUrl)
                if (res.ok) {
                  const json = await res.json()

                  if (json?.name) name = json.name
                  if (json?.description) notes = json.description

                  const attrs = Array.isArray(json?.attributes)
                    ? (json.attributes as any[])
                    : []
                  const findAttr = (key: string) =>
                    attrs.find((a) => a?.trait_type === key)?.value ?? ''

                  origin = findAttr('Origin')
                  processName = findAttr('Process')
                  timeline = {
                    harvested: findAttr('Harvested'),
                    roasted: findAttr('Roasted'),
                    packed: findAttr('Packed'),
                  }

                  const imageField = json?.image
                  if (typeof imageField === 'string') {
                    if (imageField.startsWith('ipfs://')) {
                      const imgCid = imageField.replace('ipfs://', '')
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
            } else if (uri) {
              imageUrl = uri
            }

            // Cari listing aktif terbaru untuk token ini (kalau ada)
            let priceEth = 0
            let quantity = 0
            let listingId: number | null = null
            if (listingEvents && Array.isArray(listingEvents) && marketContract) {
              for (let i = (listingEvents as any[]).length - 1; i >= 0; i--) {
                const le = (listingEvents as any[])[i]
                if (
                  String(le.args.seller).toLowerCase() !== address.toLowerCase() ||
                  Number(le.args.tokenId) !== tokenId
                ) {
                  continue
                }

                const listingIdBn = le.args.listingId as bigint
                const [sellerAddr, priceWei, active, , , stock] =
                  await marketContract.getListing(listingIdBn)
                if (!sellerAddr || !active || stock === 0n) continue

                listingId = Number(listingIdBn)
                priceEth = Number(ethers.formatEther(priceWei))
                quantity = Number(stock)
                break
              }
            }

            return {
              id: tokenId,
              name,
              origin,
              process: processName,
              notes,
              priceEth,
              quantity,
              timeline,
              listingId,
              uri,
              image: imageUrl,
            }
          }),
        )

        setProducts(items)
      } catch (err) {
        console.error('Gagal load batch farmer:', err)
      } finally {
        setLoading(false)
      }
    }

    loadBatches()
  }, [address, signer])

  const handleOpenEdit = (product: any) => {
    if (!product.listingId) {
      showToast('Batch ini belum memiliki listing aktif.', 'error')
      return
    }
    setEditProduct(product)
    setEditPrice(product.priceEth ? String(product.priceEth) : '')
    setEditQuantity(product.quantity ? String(product.quantity) : '')
    setEditModalOpen(true)
    setOpenDropdownId(null)
  }

  const handleSaveEdit = async () => {
    if (!editProduct || !editProduct.listingId) {
      showToast('Data listing tidak ditemukan.', 'error')
      return
    }

    const priceValue = editPrice.trim()
    const qtyValue = editQuantity.trim()

    if (!priceValue || !qtyValue) {
      showToast('Price dan quantity wajib diisi.', 'error')
      return
    }

    let newPriceWei: bigint
    let newStock: bigint
    try {
      newPriceWei = ethers.parseEther(priceValue)
      newStock = BigInt(qtyValue)
      if (newPriceWei <= 0n || newStock <= 0n) throw new Error()
    } catch {
      showToast('Price atau quantity tidak valid.', 'error')
      return
    }

    try {
      if (!signer) {
        await connect()
      }
      if (!signer) {
        showToast('Gagal connect wallet.', 'error')
        return
      }

      const market = new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace.abi, signer)

      const tx = await market.updateListing(
        editProduct.listingId,
        newPriceWei,
        newStock,
        editProduct.uri || '',
      )
      await tx.wait()

      setProducts(prev =>
        prev.map(p =>
          p.id === editProduct.id
            ? {
                ...p,
                priceEth: Number(ethers.formatEther(newPriceWei)),
                quantity: Number(newStock),
              }
            : p,
        ),
      )

      showToast('Listing berhasil di-update.', 'success')
      setEditModalOpen(false)
      setEditProduct(null)
    } catch (err) {
      console.error('Gagal update listing:', err)
      showToast('Gagal update listing.', 'error')
    }
  }

  const handleDeleteListing = async (product: any) => {
    if (!product.listingId) {
      showToast('Batch ini belum memiliki listing aktif.', 'error')
      return
    }

    try {
      if (!signer) {
        await connect()
      }
      if (!signer) {
        showToast('Gagal connect wallet.', 'error')
        return
      }

      const market = new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace.abi, signer)
      const tx = await market.cancelListing(product.listingId)
      await tx.wait()

      setProducts(prev =>
        prev.map(p =>
          p.id === product.id
            ? {
                ...p,
                priceEth: 0,
                quantity: 0,
                listingId: null,
              }
            : p,
        ),
      )

      showToast('Listing berhasil dihapus.', 'success')
      setOpenDropdownId(null)
    } catch (err) {
      console.error('Gagal menghapus listing:', err)
      showToast('Gagal menghapus listing.', 'error')
    }
  }

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 max-w-5xl mx-auto flex flex-col gap-6">
      {/* Top Bar */}
      <div className="flex justify-between items-center gap-2">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 p-2 border border-gray-300 rounded-xl hover:bg-gray-100"
        >
          <ArrowLeft size={16} />
          <span className="cursor-pointer text-sm font-medium">Kembali</span>
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => router.push('/farmer/minting')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            <Coffee size={16} />
            Mint New Coffee
          </button>

          <button
            onClick={() => router.push('/farmer/dashboard')}
            className="flex items-center gap-2 px-4 py-2 text-black border border-gray-300 rounded-lg hover:bg-gray-300 cursor-pointer"
          >
            <LayoutDashboard size={16} />
            Shipment Dashboard
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div>
        <input
          type="text"
          placeholder="Search your coffee..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {loading && filteredProducts.length === 0 && (
          <div className="col-span-full text-center text-gray-500 text-sm">
            Loading your on-chain batches...
          </div>
        )}

        {!loading && filteredProducts.length === 0 && (
          <div className="col-span-full text-center text-gray-500 text-sm">
            Kamu belum punya batch kopi. Coba mint di halaman &quot;Mint New Coffee&quot;.
          </div>
        )}

        {filteredProducts.map(product => (
          <div key={product.id} className="border border-gray-200 rounded-lg p-4 relative">
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-40 object-cover rounded-md mb-3"
            />
            <h2 className="font-semibold">{product.name}</h2>
            <p className="text-sm text-gray-500">Token ID: {product.id}</p>
            <p className="text-xs text-gray-500">
              {product.origin || '-'} • {product.process || '-'}
            </p>
            <p className="mt-2 font-bold">{product.priceEth ? `${product.priceEth} ETH` : '-'}</p>
            <p className="text-xs text-gray-500">Stock: {product.quantity}</p>
            <p className="mt-1 text-[11px] text-gray-400">
              Harvested: {product.timeline?.harvested || '-'}
            </p>

            {/* More actions (placeholder) */}
            <div className="absolute top-3 right-3">
              <button
                onClick={() =>
                  setOpenDropdownId(openDropdownId === product.id ? null : product.id)
                }
                className="p-1 cursor-pointer border border-gray-300 rounded-full hover:bg-gray-100"
                aria-label="Open product actions menu"
                title="Open product actions menu"
              >
                <MoreVertical size={18} />
              </button>

              <AnimatePresence>
                {openDropdownId === product.id && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 mt-2 w-28 bg-white border border-gray-200 rounded-md shadow-lg z-10"
                  >
                    <button
                      className="w-full text-black cursor-pointer text-left px-3 py-2 hover:bg-gray-100"
                      onClick={() => handleOpenEdit(product)}
                    >
                      Edit
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-red-600 cursor-pointer"
                      onClick={() => handleDeleteListing(product)}
                    >
                      Delete
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {editModalOpen && editProduct && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <motion.div
              className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-md z-30"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="text-lg font-semibold mb-4">Edit Listing</h2>
              <p className="text-sm text-gray-600 mb-2">{editProduct.name}</p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">Price (ETH)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={editPrice}
                    onChange={e => setEditPrice(e.target.value)}
                    className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Stock</label>
                  <input
                    type="number"
                    value={editQuantity}
                    onChange={e => setEditQuantity(e.target.value)}
                    className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setEditModalOpen(false)
                    setEditProduct(null)
                  }}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}

export default DashboardFarmer
