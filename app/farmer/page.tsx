'use client'
import React, { useState } from 'react'
import { ArrowLeft, MoreVertical } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'


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




const DashboardFarmer = () => {
  const [search, setSearch] = useState('')
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null)
  const router = useRouter();

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase())
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

        <button
          onClick={() => router.push('/farmer/minting')}
          className="cursor-pointer px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-700"
        >
          Mint New Coffee
        </button>
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
        {filteredProducts.map(product => (
          <div key={product.id} className="border border-gray-200 rounded-lg p-4 relative">
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-40 object-cover rounded-md mb-3"
            />
            <h2 className="font-semibold">{product.name}</h2>
            <p className="text-sm text-gray-500">{product.origin}</p>
            <p className="mt-2 font-bold">${product.priceEth}</p>

            {/* MoreVertical Dropdown */}
            <div className="absolute top-3 right-3">
              <button
                onClick={() =>
                  setOpenDropdownId(openDropdownId === product.id ? null : product.id)
                }
                className="p-1 cursor-pointer border border-gray-300 rounded-full hover:bg-gray-100"
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
                    <button className="w-full text-black cursor-pointer text-left px-3 py-2 hover:bg-gray-100">
                      Edit
                    </button>
                    <button className="w-full text-left px-3 py-2 hover:bg-gray-100 text-red-600 cursor-pointer">
                      Delete
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DashboardFarmer
