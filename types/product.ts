import { useState } from "react"

interface Product {
    id: number
    name: string
    origin: string
    process: string
    notes: string
    priceEth: number
    quantity: number
    timeline: {
        harvested: string
        roasted: string
        packed: string
    }
    image: string
}

const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)