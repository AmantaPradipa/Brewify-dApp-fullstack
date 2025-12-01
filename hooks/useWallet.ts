'use client'
import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'

const EXPECTED_CHAIN_ID = process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID
  ? BigInt(process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID)
  : undefined

export default function useWallet() {
  const [address, setAddress] = useState<string | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [hasLoggedOut, setHasLoggedOut] = useState(false)
  const [chainId, setChainId] = useState<bigint | null>(null)
  const [wrongNetwork, setWrongNetwork] = useState(false)

  // ----- CONNECT WALLET -----
  const connect = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      alert('Install MetaMask dulu bro!')
      return
    }

    try {
      setIsConnecting(true)
      const accounts: string[] = await (window as any).ethereum.request({
        method: 'eth_requestAccounts',
      })
      if (accounts.length === 0) throw new Error('No accounts found')

      const provider = new ethers.BrowserProvider((window as any).ethereum)
      const signerInstance = await provider.getSigner()
      const network = await provider.getNetwork()

      setAddress(accounts[0])
      setSigner(signerInstance)
      setHasLoggedOut(false)
      setChainId(network.chainId)

      if (EXPECTED_CHAIN_ID && network.chainId !== EXPECTED_CHAIN_ID) {
        setWrongNetwork(true)
        console.warn(
          `Wallet connected to chain ${network.chainId.toString()} but EXPECTED_CHAIN_ID is ${EXPECTED_CHAIN_ID.toString()}`,
        )
      } else {
        setWrongNetwork(false)
      }
    } catch (err) {
      console.error('Gagal connect wallet:', err)
      alert('Gagal connect wallet')
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // ----- DISCONNECT WALLET -----
  const disconnect = () => {
    setAddress(null)
    setSigner(null)
    setIsConnecting(false)
  }

  // ----- HANDLE ACCOUNT / NETWORK SWITCH -----
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).ethereum) return

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect()
      } else {
        setAddress(accounts[0])
        const provider = new ethers.BrowserProvider((window as any).ethereum)
        provider.getSigner().then(newSigner => {
          setSigner(newSigner)
          provider.getNetwork().then(network => {
            setChainId(network.chainId)
            if (EXPECTED_CHAIN_ID && network.chainId !== EXPECTED_CHAIN_ID) {
              setWrongNetwork(true)
            } else {
              setWrongNetwork(false)
            }
          })
        })
        setHasLoggedOut(false)
      }
    }

    const handleChainChanged = (chainIdHex: string) => {
      try {
        const newChainId = BigInt(chainIdHex)
        setChainId(newChainId)
        if (EXPECTED_CHAIN_ID && newChainId !== EXPECTED_CHAIN_ID) {
          setWrongNetwork(true)
        } else {
          setWrongNetwork(false)
        }
      } catch (err) {
        console.error('Gagal parse chainId dari chainChanged:', chainIdHex, err)
        setChainId(null)
        setWrongNetwork(false)
      }
    }

    const ethereum = (window as any).ethereum
    ethereum.on('accountsChanged', handleAccountsChanged)
    ethereum.on('chainChanged', handleChainChanged)

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged)
      ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }, [disconnect])

  return {
    connect,
    disconnect,
    address,
    signer,
    isConnecting,
    hasLoggedOut,
    chainId,
    wrongNetwork,
    expectedChainId: EXPECTED_CHAIN_ID,
  }
}
