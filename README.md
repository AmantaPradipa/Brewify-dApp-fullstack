# Brewify – Coffee Batch NFT dApp

dApp untuk rantai pasok kopi berbasis NFT: petani (farmer) melakukan minting Batch NFT di blockchain, pembeli (buyer) bisa menelusuri batch kopi, membeli, dan memantau status pengiriman secara transparan.

---

## 1. Ringkasan Fitur

- **Batch NFT (ERC721)**  
  Setiap batch kopi dimodelkan sebagai NFT dengan metadata IPFS dan status produksi/pengiriman on-chain.

- **Farmer Flow**
  - Dashboard untuk melihat daftar batch (dummy data untuk sekarang).
  - Halaman minting untuk membuat Batch NFT baru:
    - Upload gambar ke IPFS via Pinata.
    - Simpan hash/IPFS URL di smart contract.
    - Generate QR code per token.

- **Buyer Flow**
  - Landing page marketplace (dummy listing untuk sekarang) dengan filter kopi.
  - Modal detail produk + tombol “Buy Now” yang mengirim ETH ke alamat contoh via MetaMask.
  - Halaman buyer untuk melihat daftar order dan status pengiriman (dummy).

- **Integrasi Web3 & IPFS**
  - Koneksi wallet dan transaksi menggunakan `ethers` v6.
  - Penyimpanan file & metadata di IPFS menggunakan Pinata SDK.
  - QR code untuk akses cepat ke informasi token/batch.

---

## 2. Tech Stack & Libraries

- **Frontend**
  - `Next.js 16` (App Router)
  - `React 19` + `TypeScript`
  - `Tailwind CSS v4` (di-import di `app/globals.css`)
  - `framer-motion` – animasi halaman & modal
  - `lucide-react` – ikon
  - `qrcode.react` – generator QR code

- **Web3 & Storage**
  - `ethers` v6 – koneksi wallet, transaksi, kontrak
  - `@openzeppelin/contracts` – implementasi ERC721
  - `pinata` (PinataSDK) – upload file & JSON ke IPFS + signed URL

- **Smart Contract & Tooling**
  - `Truffle` – compile dan deploy smart contract
  - Solidity 0.8.21 (diset di `truffle-config.js`)

---

## 3. Arsitektur & Struktur Direktori

Struktur utama (hanya yang relevan):

- `app/`
  - `layout.tsx` – root layout Next.js.
  - `page.tsx` – landing marketplace kopi untuk pembeli:
    - Filter berdasarkan jenis kopi, proses, dan range harga (dummy).
    - Kartu produk membuka `ProductModal`.
  - `buyer/page.tsx` – dashboard pembeli:
    - Tabel order dengan status: *Awaiting Shipment*, *On The Way*, *Arrived* (dummy).
  - `farmer/page.tsx` – dashboard farmer:
    - Daftar batch (dummy), tombol ke halaman minting.
  - `farmer/minting/page.tsx` – halaman mint Batch NFT:
    - Form detail batch (nama, origin, process, description, priceEth, quantity, timeline).
    - Upload file ke IPFS via API Next.js.
    - Mint ke smart contract `BatchNFT`.
    - Tampilkan QR code setelah mint.
  - `components/Toast.tsx` – notifikasi kecil (success/error) dengan auto-dismiss.
  - `components/ProductModal.tsx` – modal detail produk:
    - Menampilkan metadata batch.
    - Tombol “Buy Now” mengirim ETH dengan `BrowserProvider` dari `ethers`.

- `app/api/`
  - `upload/route.ts`
    - `POST /api/upload`
    - Terima `file` dari FormData.
    - Upload ke Pinata `pinata.upload.public.file(file)`.
    - Konversi CID ke URL gateway publik dan kembalikan sebagai `{ url }`.
  - `url/route.ts`
    - `GET /api/url`
    - Generate signed URL Pinata dengan masa berlaku 30 detik.

- `utils/`
  - `config.ts`
    - Inisialisasi `PinataSDK` dengan:
      - `PINATA_JWT`
      - `NEXT_PUBLIC_GATEWAY_URL`
    - Helper:
      - `uploadFileToIPFS(file: File)` – upload file, kembalikan URL gateway.
      - `uploadJSONToIPFS(jsonData: object)` – upload JSON metadata.
  - `BatchNFT.ts`
    - Util untuk berinteraksi dengan smart contract `BatchNFT`:
      - Otomatis memilih:
        - `BrowserProvider` (MetaMask) jika `window.ethereum` tersedia.
        - `JsonRpcProvider` read-only jika hanya ada `NEXT_PUBLIC_RPC_URL`.
      - Fungsi:
        - `mintBatch(to, ipfsHash)` – mint Batch NFT.
        - `updateBatchStatus(tokenId, status)` – update status batch (transaksi).
        - `getBatchMetadata(tokenId)` – baca metadata.
        - `getBatchStatus(tokenId)` – baca status enum.

- `contracts/`
  - `BatchNFT.sol`
    - ERC721 “Brewify Batch” (`BBATCH`).
    - State:
      - `uint256 public nextTokenId;`
      - `enum Status { Harvesting, Roasting, Packaged, Shipped, Delivered }`
      - `mapping(uint256 => string) public batchMetadata;`
      - `mapping(uint256 => Status) public batchStatus;`
    - Event:
      - `BatchMinted(uint256 tokenId, address owner, string ipfsHash)`
      - `StatusUpdated(uint256 tokenId, Status status)`
    - Fungsi utama:
      - `mintBatch(address to, string memory ipfsHash)`:
        - Mint token id baru ke `to`.
        - Simpan metadata IPFS.
        - Inisialisasi status ke `Status.Harvesting`.
      - `updateBatchStatus(uint256 tokenId, Status newStatus)`:
        - Hanya owner NFT yang boleh update status.
        - Emit event `StatusUpdated`.

- `migrations/`
  - `2_deploy_contracts.js`
    - Script Truffle untuk deploy `BatchNFT`.

- `truffle-config.js`
  - Konfigurasi jaringan `development` (localhost:8545) dan compiler `0.8.21`.

---

## 4. Alur Fitur (End-to-End)

### 4.1 Marketplace (Landing Page)

File: `app/page.tsx`

- Menampilkan daftar produk kopi (dummy) dengan:
  - Nama batch, origin, process, notes, harga (ETH), timeline.
  - Filter berdasarkan tipe kopi, proses, dan range harga (UI saja, belum terhubung kontrak).
- Klik kartu produk membuka `ProductModal`:
  - Menampilkan detail batch + timeline.
  - Tombol **“Buy Now”**:
    - Cek `window.ethereum`.
    - Gunakan `BrowserProvider` untuk mendapatkan `signer`.
    - Mengirim transaksi `sendTransaction` ke alamat penerima contoh:
      - `to: 0xdF4651D302A5c0Fbe79851db4BFa709db7e7b3F1`
      - `value: parseEther(product.priceEth)`.
    - Menampilkan toast sukses/gagal.

> Catatan: untuk saat ini, transaksi buy belum lewat kontrak marketplace/escrow, hanya direct transfer ke alamat contoh.

### 4.2 Dashboard Farmer

File: `app/farmer/page.tsx`

- Menampilkan daftar batch (dummy) milik farmer.
- Fitur:
  - Pencarian batch by nama.
  - Tombol **“Mint New Coffee”** untuk menuju halaman minting `/farmer/minting`.
  - Dropdown `Edit` / `Delete` (UI placeholder, belum terhubung ke kontrak).

### 4.3 Minting Batch NFT

File: `app/farmer/minting/page.tsx`

- Form input:
  - `name`, `origin`, `process`, `description`
  - `priceEth`, `quantity`
  - `harvested`, `roasted`, `packed` (timeline)
  - Upload file gambar batch.

- Proses `handleMint`:
  1. Validasi field wajib.
  2. Upload file ke `/api/upload`:
     - Endpoint mem-forward ke Pinata dan mengembalikan URL gateway.
     - Di kontrak yang sekarang, kode memanfaatkan nilai `ipfs://CID` (cek/align dengan implementasi akhir).
  3. Cek `window.ethereum` dan inisialisasi:
     - `ethers.BrowserProvider(window.ethereum)`
     - `const signer = await provider.getSigner();`
  4. Instansiasi kontrak:
     - `new ethers.Contract(CONTRACT_ADDRESS, BatchNFTAbi.abi, signer)`
  5. Panggil `mintBatch(to, ipfsHash)`:
     - `to` = address signer.
     - Menunggu transaksi selesai dan membaca event `BatchMinted` untuk `tokenId`.
  6. Baca ulang:
     - `batchMetadata(tokenId)`
     - `batchStatus(tokenId)`
  7. Simpan `tokenId` dan tampilkan QR code:
     - Saat ini value QR code berupa URL contoh: `https://example.com/token/${tokenId}`.

### 4.4 Dashboard Buyer

File: `app/buyer/page.tsx`

- Tabel order dummy dengan kolom:
  - Nama batch, origin, process
  - Harga (ETH), qty
  - Status (Awaiting Shipment, On The Way, Arrived)
- Status visual:
  - Warna dan efek glow/blink bergantung pada status.
  - Animasi blink untuk *Awaiting Shipment* (CSS keyframes manual).
- Tombol **“Confirm”**:
  - Muncul hanya jika status *Arrived* (untuk sekarang hanya `alert`, belum mengubah kontrak).

---

## 5. Environment Variables

Buat file `.env.local` di root project:

```bash
PINATA_JWT=your_pinata_jwt
NEXT_PUBLIC_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545  # optional, untuk read-only
```

Penjelasan:

- `PINATA_JWT`  
  Token JWT dari Pinata (dibutuhkan untuk upload file/JSON).

- `NEXT_PUBLIC_GATEWAY_URL`  
  Gateway publik IPFS via Pinata untuk mengakses file berdasarkan CID.

- `NEXT_PUBLIC_RPC_URL` (opsional)  
  Jika MetaMask tidak tersedia di browser, util `utils/BatchNFT.ts` bisa memakai RPC ini untuk operasi read-only (mis. dashboard yang hanya perlu baca metadata/status).

Jika Anda deploy kontrak baru, **jangan lupa**:
- Update `CONTRACT_ADDRESS` di:
  - `utils/BatchNFT.ts`
  - `app/farmer/minting/page.tsx`

---

## 6. Menjalankan Proyek

### 6.1 Prasyarat

- Node.js 18+ dan npm
- MetaMask (browser extension)
- Truffle (`npm install -g truffle`, opsional jika ingin main di lokal)
- Ganache/Anvil/Hardhat node lokal (untuk `network development`, jika dipakai)

### 6.2 Install Dependencies

```bash
npm install
```

### 6.3 Menjalankan Blockchain Lokal (Opsional)

Jika ingin pakai Truffle + Ganache:

1. Jalankan Ganache GUI/CLI di `127.0.0.1:8545`.
2. Compile & migrate kontrak:

```bash
truffle compile
truffle migrate --network development
```

3. Ambil address kontrak `BatchNFT` hasil deploy dari output `truffle migrate`.
4. Update:
   - `CONTRACT_ADDRESS` di `utils/BatchNFT.ts`
   - `CONTRACT_ADDRESS` di `app/farmer/minting/page.tsx`
5. Import private key dari Ganache ke MetaMask dan set jaringan custom RPC yang sama (`127.0.0.1:8545`).

### 6.4 Menjalankan Frontend

```bash
npm run dev
```

Aplikasi akan berjalan di: `http://localhost:3000`

---

## 7. API & Utils Detail

### 7.1 API Upload (IPFS)

- **Endpoint**: `POST /api/upload`
- **Body**: `form-data` dengan field `file`
- **Respons sukses**:  
  ```json
  { "url": "https://gateway.pinata.cloud/ipfs/<CID>" }
  ```

Digunakan di halaman minting untuk mengunggah gambar batch sebelum mint NFT.

### 7.2 API Signed URL

- **Endpoint**: `GET /api/url`
- Menghasilkan signed URL Pinata yang berlaku **30 detik**.  
  Cocok untuk use-case upload client-side langsung ke Pinata jika diperlukan di masa depan.

### 7.3 Utils Kontrak (`utils/BatchNFT.ts`)

- `getProviderAndSigner()`  
  - Jika `window.ethereum` ada: gunakan `BrowserProvider` dan `getSigner()`.
  - Jika tidak ada, tetapi `NEXT_PUBLIC_RPC_URL` diset: gunakan `JsonRpcProvider` (read-only).

- `getContract(withSigner?: boolean)`  
  - Mengembalikan instance `ethers.Contract` berbasis `CONTRACT_ADDRESS` dan `BatchNFTAbi.abi`.

- Fungsi publik:
  - `mintBatch(to, ipfsHash)` – mint token baru.
  - `updateBatchStatus(tokenId, status)` – mengubah enum status (butuh signer).
  - `getBatchMetadata(tokenId)` – baca metadata (IPFS URL/hash).
  - `getBatchStatus(tokenId)` – baca status enum.

---

## 8. Testing

- Direktori `test/` sudah disiapkan untuk test Truffle (saat ini kosong).
- Rekomendasi test kontrak:
  - Mint Batch NFT dan cek:
    - Owner benar.
    - `batchMetadata` sesuai IPFS hash.
    - `batchStatus` awal = `Harvesting`.
  - `updateBatchStatus`:
    - Hanya owner yang dapat mengubah status.
    - Event `StatusUpdated` teremit dengan nilai enum yang benar.

Untuk frontend/backend Next.js belum ada test terintegrasi; Anda dapat menambahkan sesuai kebutuhan (mis. Jest/Playwright).

---

## 9. Roadmap Kontrak Berikutnya (Escrow & Marketplace Kopi)

Per kode sekarang, pembelian masih berupa pengiriman ETH langsung ke alamat contoh. Roadmap berikut direncanakan:

- **Kontrak Marketplace**
  - Menyimpan daftar listing batch NFT:
    - `tokenId`, harga per unit, kuantitas tersedia, pemilik.
  - Fungsi:
    - `createListing(tokenId, price, quantity)`
    - `updateListing(...)`, `cancelListing(...)`
    - `purchase(tokenId, quantity)` yang berinteraksi dengan escrow.

- **Kontrak Escrow**
  - Menahan dana pembeli (ETH/USDC) sampai pesanan dikonfirmasi terkirim.
  - Flow:
    - Buyer memanggil `purchase` di marketplace → dana masuk ke escrow untuk order tertentu.
    - Farmer meng-update status batch (on-chain) sampai `Delivered`.
    - Buyer mengkonfirmasi penerimaan → escrow melepas dana ke farmer.
    - Opsi dispute/cancel sebelum pengiriman (refund ke buyer).

- **Integrasi Frontend**
  - Landing/marketplace:
    - Menarik listing langsung dari kontrak marketplace (bukan dummy array).
  - `ProductModal`:
    - Tombol “Buy Now” memanggil `purchase` di kontrak marketplace (bukan `sendTransaction` langsung).
  - Halaman buyer:
    - Menarik daftar order & status escrow on-chain.
    - Tombol “Confirm” memanggil fungsi release dana di escrow.
  - Dashboard farmer:
    - Mengupdate `batchStatus` di kontrak BatchNFT.
    - Memicu logika release dana escrow setelah status `Delivered`.

Roadmap ini menjaga garis besar arsitektur yang sudah ada (BatchNFT + IPFS + Pinata) sambil menambahkan layer ekonomi dan keamanan melalui escrow & marketplace on-chain.

