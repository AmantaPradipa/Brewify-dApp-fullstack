"use client"
import { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

export default function Toast({ message, type, onClose }: any) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(), 2500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={`fixed bottom-6 right-6 z-[99999] px-4 py-3 rounded-xl text-white shadow-lg
          ${type === "success" ? "bg-green-600" : "bg-red-600"}`}
      >
        {message}
      </motion.div>
    </AnimatePresence>
  )
}
