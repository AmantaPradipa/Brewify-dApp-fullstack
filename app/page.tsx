'use client'
import React, { useState, useEffect } from 'react'
import { MoreVertical, LogOut } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ProductModal from './components/ProductModal'
import useWallet from '@/hooks/useWallet'
import { ethers } from 'ethers'
import UserProfile from '@/build/contracts/UserProfile.json'
import BatchNFT from '@/build/contracts/BatchNFT.json'
import Marketplace from '@/build/contracts/Marketplace.json'
import { useRouter } from 'next/navigation'

// ----- FILTER OPTIONS -----
const productTypes = ['Arabica', 'Robusta', 'Liberica', 'Excelsa', 'Geisha', 'Blend']
const processTypes = ['Natural', 'Washed', 'Honey Process', 'Mixed Process']
const priceRanges = ['0.010 - 0.015 ETH', '0.016 - 0.025 ETH', '0.026 - 0.050 ETH']

const BATCHNFT_ADDRESS = process.env.NEXT_PUBLIC_BATCHNFT_ADDRESS as string
const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as string
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL as string
const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL ||
  'https://gateway.pinata.cloud/ipfs') as string

const Home = () => {
  const router = useRouter()
  const {
    connect,
    address,
    signer,
    isConnecting,
    disconnect,
    wrongNetwork,
    expectedChainId,
  } = useWallet()

  const [menuOpen, setMenuOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)

  const [products, setProducts] = useState<any[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // ================= FETCH USER PROFILE (setelah wallet connect / login) =================
  useEffect(() => {
    const fetchProfile = async () => {
      if (!address || !signer) return
      try {
        const contract = new ethers.Contract(
          process.env.NEXT_PUBLIC_USERPROFILE_ADDRESS!,
          UserProfile.abi,
          signer
        )

        const { 0: roleNumber, 1: usernameFromChain, 2: isRegistered } =
          await contract.getUser(address)

        if (isRegistered) {
          const roleMap: Record<number, string> = {
            1: 'Buyer',
            2: 'Farmer',
            3: 'Logistics',
          }

          setRole(roleMap[Number(roleNumber)] || 'Unknown')
          setUsername(usernameFromChain)
          setIsLoggedIn(true)
        } else {
          setIsLoggedIn(false)
          setRole(null)
          setUsername(null)
        }
      } catch (err) {
        console.error('Gagal fetch profile:', err)
      }
    }

    fetchProfile()
  }, [address, signer])

  // ================= LOAD PRODUCTS DARI KONTRAK Marketplace =================
  useEffect(() => {
    const loadProducts = async () => {
      if (!RPC_URL || !MARKETPLACE_ADDRESS) return
      try {
        setLoadingProducts(true)

        const provider = new ethers.JsonRpcProvider(RPC_URL)
        const market = new ethers.Contract(MARKETPLACE_ADDRESS, Marketplace.abi, provider)
        const batch = new ethers.Contract(BATCHNFT_ADDRESS, BatchNFT.abi, provider)
        const profile = new ethers.Contract(
          process.env.NEXT_PUBLIC_USERPROFILE_ADDRESS!,
          UserProfile.abi,
          provider,
        )

        // Ambil semua event ListingCreated dari block 0
        const events = await market.queryFilter('ListingCreated', 0n, 'latest')

        // Kumpulkan listingId unik
        const seen = new Set<number>()
        const listingIds: number[] = []
        for (const ev of events as any[]) {
          const id = Number(ev.args.listingId)
          if (!seen.has(id)) {
            seen.add(id)
            listingIds.push(id)
          }
        }

        const gatewayBase = GATEWAY_URL.replace(/\/$/, '')

        const sellerNameCache: Record<string, string> = {}

        const rawItems = await Promise.all(
          listingIds.map(async (id) => {
            const [seller, price, active, tokenId, uri, stock] =
              await market.getListing(id)
            if (!active || stock === 0n) return null

            let metadataUri: string = uri

            // Jika uri kosong di listing, fallback ke tokenURI di BatchNFT
            if (!metadataUri || metadataUri.length === 0) {
              try {
                metadataUri = await batch.tokenURI(tokenId)
              } catch {
                // abaikan, biarkan kosong
              }
            }

            let name = `Batch #${tokenId}`
            let origin = ''
            let processName = ''
            let notes = ''
            let timeline: {
              harvested?: string
              roasted?: string
              packed?: string
            } = {}

            let imageUrl = metadataUri || ''

            const sellerAddress = String(seller)
            const sellerKey = sellerAddress.toLowerCase()
            let farmerName = ''

            if (sellerNameCache[sellerKey]) {
              farmerName = sellerNameCache[sellerKey]
            } else {
              try {
                const { 1: usernameFromChain, 2: isRegistered } = await profile.getUser(
                  sellerAddress,
                )
                if (isRegistered && usernameFromChain && usernameFromChain.length > 0) {
                  farmerName = usernameFromChain as string
                } else {
                  farmerName = `${sellerAddress.slice(0, 6)}...${sellerAddress.slice(-4)}`
                }
              } catch {
                farmerName = `${sellerAddress.slice(0, 6)}...${sellerAddress.slice(-4)}`
              }
              sellerNameCache[sellerKey] = farmerName
            }

            if (metadataUri && metadataUri.startsWith('ipfs://')) {
              const cid = metadataUri.replace('ipfs://', '')
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
            }

            const priceEth = Number(ethers.formatEther(price))

            return {
              id: Number(tokenId),
              listingId: id,
              name,
              origin,
              process: processName,
              notes,
              priceEth,
              quantity: Number(stock),
              timeline,
              image: imageUrl,
              seller,
              farmerName,
            }
          })
        )

        setProducts(rawItems.filter(Boolean))
      } catch (err) {
        console.error('Gagal load produk dari Marketplace:', err)
      } finally {
        setLoadingProducts(false)
      }
    }

    loadProducts()
  }, [])

  const openModal = (product: any) => {
    setSelectedProduct(product)
    setModalOpen(true)
  }

  const handleRegisterClick = async () => {
    try {
      if (!address) {
        await connect()
      }
      router.push('/roles')
    } catch (err) {
      console.error('Gagal register:', err)
    }
  }

  const handleLoginClick = async () => {
    try {
      // pastikan wallet connect
      if (!address) {
        await connect()
      }

      // gunakan signer saat ini untuk baca profil dan redirect
      if (!signer || !address) return

      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_USERPROFILE_ADDRESS!,
        UserProfile.abi,
        signer
      )

      const { 0: roleNumber, 1: usernameFromChain, 2: isRegistered } =
        await contract.getUser(address)

      if (!isRegistered) {
        // jika belum register, arahkan ke page role
        router.push('/roles')
        return
      }

      const roleMap: Record<number, string> = {
        1: 'Buyer',
        2: 'Farmer',
        3: 'Logistics',
      }

      const mappedRole = roleMap[Number(roleNumber)] || 'Unknown'

      setRole(mappedRole)
      setUsername(usernameFromChain)
      setIsLoggedIn(true)

      const roleRouteMap: Record<string, string> = {
        Buyer: '/buyer',
        Farmer: '/farmer',
        Logistics: '/logistic',
      }

      const target = roleRouteMap[mappedRole]
      if (target) {
        router.push(target)
      }
    } catch (err) {
      console.error('Gagal login:', err)
    }
  }

  return (
    <motion.div
      className="flex flex-col min-h-screen p-4 max-w-5xl mx-auto"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* ================= NAV ================= */}
      <nav className="flex justify-between items-center mb-4 relative">
        <h1 className="text-2xl font-bold tracking-tight">Brewify.co</h1>

        {!isLoggedIn && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRegisterClick}
              disabled={isConnecting}
              className="px-4 py-2 bg-white border border-blue-500 text-blue-500 rounded-xl text-sm hover:bg-blue-50 disabled:opacity-50"
            >
              {isConnecting && !address ? 'Connecting...' : 'Register'}
            </button>
            <button
              onClick={handleLoginClick}
              disabled={isConnecting}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isConnecting && !address ? 'Connecting...' : 'Login'}
            </button>
          </div>
        )}

        {isLoggedIn && role && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const roleRouteMap: Record<string, string> = {
                  Buyer: '/buyer',
                  Farmer: '/farmer',
                  Logistics: '/logistic',
                }
                router.push(roleRouteMap[role])
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-700 cursor-pointer"
            >
              Dashboard {role}
            </button>

            <button
              className="p-2 border border-gray-300 rounded-full hover:bg-gray-100 cursor-pointer"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Open user menu"
              title="Open user menu"
            >
              <MoreVertical size={20} />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-12 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-10"
                >
                  <div className="px-4 py-3 border-b">
                    <p className="text-md">{username || 'User'}</p>
                    <p className="text-xs text-gray-500">Role: {role}</p>
                  </div>

                  <button
                    onClick={() => {
                      disconnect()
                      setIsLoggedIn(false)
                      setRole(null)
                      setUsername(null)
                      setMenuOpen(false)
                      router.push('/')
                    }}
                    className="w-full flex items.center gap-2 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} /> Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </nav>

      {wrongNetwork && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span className="font-semibold">Wrong network:</span>{' '}
          Please switch your wallet to chain ID{' '}
          {expectedChainId ? expectedChainId.toString() : 'the configured network'}.
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search coffee..."
          className="w-full p-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* ============== MAIN LAYOUT ============== */}
      <div className="flex flex-col md:flex-row gap-6 flex-grow">
        {/* ----------- SIDEBAR FILTER ----------- */}
        <div className="w-full md:w-1/4 space-y-6 sticky top-4 self-start">
          {/* Filter Type */}
          <div>
            <p className="uppercase text-gray-500 text-xs font-semibold mb-2">Filter by Type</p>
            <div className="flex flex-col gap-2">
              {productTypes.map(type => (
                <label
                  key={type}
                  className="flex items-center rounded-md p-2 cursor-pointer hover:bg-gray-100"
                >
                  <input type="checkbox" className="mr-2 w-4 h-4 accent-indigo-500" />
                  <span className="text-sm">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Filter Process */}
          <div>
            <p className="uppercase text-gray-500 text-xs font-semibold mb-2">Process</p>
            <div className="flex flex-col gap-2">
              {processTypes.map(process => (
                <label
                  key={process}
                  className="flex items-center rounded-md p-2 cursor-pointer hover:bg-gray-100"
                >
                  <input type="checkbox" className="mr-2 w-4 h-4 accent-indigo-500" />
                  <span className="text-sm">{process}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Filter Price */}
          <div>
            <p className="uppercase text-gray-500 text-xs font-semibold mb-2">Price Range</p>
            <div className="flex flex-col gap-2">
              {priceRanges.map(range => (
                <label
                  key={range}
                  className="flex items-center rounded-md p-2 cursor-pointer hover:bg-gray-100"
                >
                  <input type="checkbox" className="mr-2 w-4 h-4 accent-indigo-500" />
                  <span className="text-sm">{range}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ----------- PRODUCT LIST ----------- */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {loadingProducts && products.length === 0 && (
            <div className="col-span-full text-center text-gray-500 text-sm">
              Loading on-chain coffee batches...
            </div>
          )}

          {!loadingProducts && products.length === 0 && (
            <div className="col-span-full text-center text-gray-500 text-sm">
              Belum ada batch kopi yang di-mint.
            </div>
          )}

          {products.map(product => (
            <motion.div
              key={product.id}
              className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition bg-white flex flex-col"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => openModal(product)}
            >
              <img
                src={product.image}
                className="w-full h-60 object-cover rounded-md mb-3"
                alt={product.name}
              />
              <h2 className="font-semibold">{product.name}</h2>
              <p className="text-xs text-gray-500">by {product.farmerName}</p>
              <p className="mt-1 text-xs text-gray-500">
                {product.origin || '-'} • {product.process || '-'}
              </p>
              <p className="mt-2 text-sm font-semibold">{product.priceEth} ETH</p>
              <p className="text-xs text-gray-500">Stock: {product.quantity}</p>
              <p className="mt-1 text-[11px] text-gray-400">
                Harvested: {product.timeline?.harvested || '-'}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Modal */}
      <ProductModal open={modalOpen} onClose={() => setModalOpen(false)} product={selectedProduct} />
    </motion.div>
  )
}

export default Home
