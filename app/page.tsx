'use client'
import React, { useState } from 'react'
import { MoreVertical, LogOut } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ProductModal from './components/ProductModal'

// ----- FILTER OPTIONS -----
const productTypes = [
  "Arabica", "Robusta", "Liberica", "Excelsa", "Geisha", "Blend",
]

const processTypes = [
  "Natural", "Washed", "Honey Process", "Mixed Process",
]

const priceRanges = [
  "0.010 - 0.015 ETH",
  "0.016 - 0.025 ETH",
  "0.026 - 0.050 ETH",
]

// ----- PRODUCT DATA -----
const products = [
  {
    id: 1,
    name: "Batch Arabica Kintamani #A1",
    origin: "Kintamani, Bali",
    process: "Natural",
    notes: "Fruity, Citrus, Caramel",
    priceEth: 0.015,
    quantity: 120,
    timeline: {
      harvested: "2024-07-12",
      roasted: "2024-07-20",
      packed: "2024-07-22",
    },
    image: "https://source.unsplash.com/200x200/?coffee,beans"
  },
  {
    id: 2,
    name: "Batch Robusta Temanggung #R7",
    origin: "Temanggung, Central Java",
    process: "Washed",
    notes: "Bold, Nutty, Dark Chocolate",
    priceEth: 0.010,
    quantity: 200,
    timeline: {
      harvested: "2024-08-01",
      roasted: "2024-08-05",
      packed: "2024-08-06",
    },
    image: "https://source.unsplash.com/200x200/?coffee,robusta"
  },
  {
    id: 3,
    name: "Batch Liberica Jambi #L3",
    origin: "Jambi, Sumatra",
    process: "Honey Process",
    notes: "Floral, Herbal, Sweet Finish",
    priceEth: 0.022,
    quantity: 90,
    timeline: {
      harvested: "2024-06-18",
      roasted: "2024-06-26",
      packed: "2024-06-27",
    },
    image: "https://source.unsplash.com/200x200/?coffee,liberica"
  },
  {
    id: 4,
    name: "Batch Excelsa Sulawesi #EX9",
    origin: "South Sulawesi",
    process: "Natural",
    notes: "Tropical Fruit, Complex, Vibrant Acidity",
    priceEth: 0.018,
    quantity: 150,
    timeline: {
      harvested: "2024-09-02",
      roasted: "2024-09-10",
      packed: "2024-09-11",
    },
    image: "https://source.unsplash.com/200x200/?coffee,excelsa"
  },
  {
    id: 5,
    name: "Batch Blend Nusantara #B2",
    origin: "Sumatra • Bali • Sulawesi",
    process: "Mixed Process",
    notes: "Balanced, Smooth, Slight Spice",
    priceEth: 0.013,
    quantity: 300,
    timeline: {
      harvested: "2024-05-14",
      roasted: "2024-05-22",
      packed: "2024-05-23",
    },
    image: "https://source.unsplash.com/200x200/?coffee,blend"
  },
  {
    id: 6,
    name: "Batch Geisha Papua #G5",
    origin: "Wamena, Papua",
    process: "Washed",
    notes: "Tea-like, Floral, Bergamot, Clean Cup",
    priceEth: 0.045,
    quantity: 60,
    timeline: {
      harvested: "2024-04-03",
      roasted: "2024-04-11",
      packed: "2024-04-12",
    },
    image: "https://source.unsplash.com/200x200/?coffee,geisha"
  },
]

const Home = () => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [role, setRole] = useState<string | null>(null)

  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const fakeLogin = () => {
    setIsLoggedIn(true)
    setRole("Farmer")
  }

  const openModal = (product: any) => {
    setSelectedProduct(product)
    setModalOpen(true)
  }

  return (
    <motion.div
      className="flex flex-col min-h-screen p-4 max-w-5xl mx-auto"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >

      {/* ================= NAV ================= */}
      <nav className="flex justify-between items-center mb-4 relative">
        <h1 className="text-2xl font-bold tracking-tight">Brewify.co</h1>

        {!isLoggedIn && (
          <button
            onClick={fakeLogin}
            className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm hover:opacity-80"
          >
            Login
          </button>
        )}

        {isLoggedIn && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => console.log("Go Dashboard")}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm hover:bg-blue-700 cursor-pointer"
            >
              Dashboard {role}
            </button>

            <button
              className="p-2 border border-gray-300 rounded-full hover:bg-gray-100 cursor-pointer"
              onClick={() => setMenuOpen(!menuOpen)}
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
                    <p className="text-md">Hello, User</p>
                    <p className="text-xs text-gray-500">Role: {role}</p>
                  </div>

                  <button
                    onClick={() => {
                      setIsLoggedIn(false);
                      setRole(null);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} /> Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </nav>

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

        {/* ----------- SIDEBAR FILTER (FROM OLD CODE) ----------- */}
        <div className="w-full md:w-1/4 space-y-6 sticky top-4 self-start">

          {/* Filter by Type */}
          <div>
            <p className="uppercase text-gray-500 text-xs font-semibold mb-2">
              Filter by Type
            </p>

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

          {/* Process */}
          <div>
            <p className="uppercase text-gray-500 text-xs font-semibold mb-2">
              Process
            </p>

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

          {/* Price Range */}
          <div>
            <p className="uppercase text-gray-500 text-xs font-semibold mb-2">
              Price Range
            </p>

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
        <motion.div
          className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.1 } }
          }}
        >
          {products.map(product => (
            <motion.div
              key={product.id}
              className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition"
              variants={{
                hidden: { opacity: 0, y: -10 },
                visible: { opacity: 1, y: 0 }
              }}
              transition={{ duration: 0.3 }}
              onClick={() => openModal(product)}
            >
              <img
                src={product.image}
                className="w-full h-40 object-cover rounded-md mb-3"
                alt={product.name}
              />
              <h2 className="font-semibold">{product.name}</h2>
              <p className="text-sm text-gray-500">{product.origin}</p>
              <p className="mt-2 font-bold">{product.priceEth} ETH</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Modal */}
      <ProductModal open={modalOpen} onClose={() => setModalOpen(false)} product={selectedProduct} />
    </motion.div>
  )
}

export default Home
