# Brewify – Coffee Batch NFT dApp

Brewify adalah dApp rantai pasok kopi: petani (farmer) melakukan minting Batch NFT di blockchain, pembeli (buyer) membeli kopi lewat marketplace on‑chain, dan pihak logistik (logistics) membantu update status pengiriman. Semua identitas user, metadata batch, dan pembayaran terekam di blockchain dan IPFS.

---

## 1. Fitur Utama

- **Batch NFT (ERC721)**  
  Setiap batch kopi dimodelkan sebagai NFT (ERC721) dengan metadata di IPFS (`ipfs://CID`) dan status produksi/pengiriman on‑chain.

- **On‑chain Profile & Role**
  - User connect wallet → pilih role (Buyer / Farmer / Logistics) → set username di kontrak `UserProfile`.
  - Frontend membaca role + username dari blockchain, tanpa database terpusat.

- **Marketplace + Escrow**
  - Farmer membuat listing untuk batch NFT di kontrak `Marketplace`.
  - Buyer melakukan pembelian → dana ETH dikunci di kontrak `Escrow` sampai buyer konfirmasi penerimaan.
  - Escrow mendukung fee platform dan mekanisme cancel/dispute sederhana.

- **Tracking Status Kopi**
  - Kontrak `BatchNFT` menyimpan status enum: `Unknown → Harvested → Processed → Packed → Shipped → Delivered`.
  - Farmer (role `Farmer` di `UserProfile`) mengatur status produksi awal; Logistics (role `Logistics` di `UserProfile`) mengatur status pengiriman/Delivered (otorisasi diambil dari kontrak `UserProfile`).

- **IPFS & QR Code**
  - Gambar batch di‑upload ke IPFS via Pinata; endpoint Next.js mengembalikan `cid` + URL gateway.
  - `tokenURI` di kontrak diset ke `ipfs://cid`. QR code bisa diarahkan ke halaman detail batch yang membaca metadata + status dari on‑chain/IPFS.

---

## 2. Tech Stack

- **Frontend**
  - Next.js 16 (App Router)
  - React 19 + TypeScript
  - Tailwind CSS v4 (`app/globals.css`)
  - framer-motion – animasi layout & modal
  - lucide-react – ikon
  - qrcode.react – QR code

- **Web3 & Storage**
  - ethers v6 – koneksi wallet, transaksi, kontrak
  - @openzeppelin/contracts 4.9.x – ERC721, AccessControl, dll.
  - pinata SDK – upload file/JSON ke IPFS + signed URL

- **Smart Contract & Tooling**
  - Truffle – compile & migrate kontrak
  - Solidity 0.8.19 (via `truffle-config.js`)
  - Ganache (local dev) / Infura (opsional testnet)

---

## 3. Struktur Direktori

**Frontend (`app/`)**

- `app/layout.tsx` – root layout Next.js.
- `app/page.tsx` – landing marketplace:
  - Tampilkan produk kopi (saat ini masih dummy).
  - Komponen `ProductModal` untuk lihat detail & aksi beli (masih `sendTransaction` langsung, siap diarahkan ke `Marketplace.purchase`).
  - Nav bar menggunakan hook `useWallet` + kontrak `UserProfile` untuk menampilkan username dan role.
- `app/roles/page.tsx` – halaman pemilihan role + username:
  - Step 1: pilih role (Buyer/Farmer/Logistics).
  - Step 2: isi username.
  - Panggil `UserProfile.setUserProfile(role, username)` dengan wallet user.
- `app/farmer/page.tsx` – dashboard farmer:
  - List batch kopi (saat ini dummy).
  - Tombol ke `/farmer/minting` dan `/farmer/dashboard`.
- `app/farmer/minting/page.tsx` – form mint Batch NFT:
  - Input: nama batch, origin, process, description, price, quantity, timeline (harvested/roasted/packed), upload gambar.
  - Upload file ke `/api/upload` → IPFS (Pinata) → balikan `{ cid, url }`.
  - Bentuk `ipfs://cid` sebagai `uri` dan panggil `BatchNFT.mintBatch(to, uri)`.
  - Baca kembali `tokenURI` dan `getStatus` untuk menampilkan metadata/status + QR code.
- `app/farmer/dashboard/page.tsx` – “Farmer Shipment Dashboard” (dummy):
  - Menampilkan pesanan yang perlu dipacking dan tombol “Packing”; siap untuk dihubungkan ke `BatchNFT.updateBatchStatus` dan `Escrow`.
- `app/buyer/page.tsx` – dashboard buyer (dummy):
  - Tabel pesanan dengan status dan tombol “Confirm Payment” (simulasi).
  - Nantinya akan membaca data dari `Escrow` dan `BatchNFT`.
- `app/logistic/page.tsx` – dashboard logistics (dummy):
  - Mengatur status shipment (Awaiting Shipment, On The Way, Arrived) via UI; siap dihubungkan ke `BatchNFT.updateBatchStatus` dengan role LOGISTICS_ROLE.
- `app/components/ProductModal.tsx` – modal detail produk dan tombol “Buy Now” (saat ini kirim ETH langsung; target ke `Marketplace.purchase`).
- `app/components/Toast.tsx` – notifikasi ringan (success/error) dengan framer-motion.

**API Routes (`app/api/`)**

- `app/api/upload/route.ts`
  - `POST /api/upload`
  - Terima `file` via `form-data`.
  - `pinata.upload.public.file(file)` → dapat `cid`.
  - `pinata.gateways.public.convert(result.cid)` → URL gateway.
  - Response:
    ```json
    { "cid": "<CID>", "url": "https://gateway.pinata.cloud/ipfs/<CID>" }
    ```
- `app/api/url/route.ts`
  - `GET /api/url`
  - Generate signed URL Pinata (berlaku 30 detik) via `pinata.upload.public.createSignedURL`.

**Utils & Hooks**

- `utils/config.ts`
  - Inisialisasi `PinataSDK` dengan:
    - `PINATA_JWT`
    - `NEXT_PUBLIC_GATEWAY_URL`
  - Helper:
    - `uploadFileToIPFS(file)` – upload file dan kembalikan URL gateway.
    - `uploadJSONToIPFS(jsonData)` – upload JSON dan kembalikan URL gateway.
- `utils/BatchNFT.ts`
  - Util untuk interaksi dengan kontrak `BatchNFT` (alamat dari `NEXT_PUBLIC_BATCHNFT_ADDRESS`):
    - Otomatis memilih `BrowserProvider` (MetaMask) atau `JsonRpcProvider` (RPC read‑only).
    - Fungsi:
      - `mintBatch(to, ipfsHash)`
      - `updateBatchStatus(tokenId, status)`
      - `getBatchMetadata(tokenId)` → `tokenURI(tokenId)`
      - `getBatchStatus(tokenId)` → `getStatus(tokenId)`
- `utils/getUserProfile.ts`
  - Helper untuk mendapatkan instance kontrak `UserProfile` berbasis artefak `build/contracts/UserProfile.json` dan `providerOrSigner`.
- `hooks/useWallet.ts`
  - Abstraksi connect/disconnect MetaMask:
    - Menyimpan `address`, `signer`, `isConnecting`.
    - Menangani event `accountsChanged` / `chainChanged`.

**Kontrak (`contracts/`)**

- `BatchNFT.sol`
  - ERC721 dengan `ERC721URIStorage` + `AccessControl`.
  - Nama: `Brewify Coffee Batch` (`BREW`).
  - Roles:
    - `DEFAULT_ADMIN_ROLE`
    - `MINTER_ROLE` – mint/update status awal batch.
    - `LOGISTICS_ROLE` – update status pengiriman (`Shipped`/`Delivered`).
  - State:
    - `uint256 private _nextId = 1;`
    - `enum Status { Unknown, Harvested, Processed, Packed, Shipped, Delivered }`
    - `mapping(uint256 => Status) public tokenStatus;`
    - `mapping(uint256 => address) public creator;`
  - Fungsi utama:
    - `mintBatch(address to, string uri)` – mint token baru, set `Status.Harvested`, simpan `tokenURI`.
    - `updateBatchStatus(tokenId, Status newStatus)` – cek order enum + role (Farmer untuk Harvested/Processed/Packed, Logistics untuk Shipped/Delivered).
    - `updateTokenURI(tokenId, string newUri)` – owner/Minter boleh update metadata.
    - `getStatus(tokenId)` – baca enum status.

- `UserProfile.sol`
  - Registry user on‑chain:
    - `enum Role { None, Buyer, Farmer, Logistics }`
    - `struct Profile { Role role; string username; bool isRegistered; }`
    - `mapping(address => Profile) public profiles;`
  - Fungsi:
    - `setUserProfile(Role _role, string _username)` – set role + username untuk `msg.sender`.
    - `getUser(address)` – return `(roleUint8, username, isRegistered)`.
    - `getRole(address)`, `getUsername(address)` helper.

- `Escrow.sol`
  - Mengelola escrow pesanan marketplace:
    - Menahan dana buyer (`amount`) sampai buyer confirm atau dispute diresolve.
    - Menyimpan `EscrowOrder` dengan field buyer, seller, amount, fee snapshot, status shipped/disputed/released.
  - Hanya address yang diset sebagai `approvedMarketplace[addr]` yang boleh memanggil `createEscrow`.
  - Fungsi utama:
    - `createEscrow(seller, buyer, feeBpsSnapshot)` (payable, onlyApproved).
    - `markShipped(escrowId)` (seller).
    - `confirmReceived(escrowId)` (buyer) → release dana ke seller minus fee.
    - `approveCancel(escrowId)` → kedua pihak setuju cancel → refund buyer.
    - `raiseDispute`, `resolveDispute` (owner/arbitrator).

- `Marketplace.sol`
  - Marketplace untuk listing dan beli Batch NFT:
    - Interface ke `IEscrow`, `IBatchNFT`, `IUserProfile`.
  - State:
    - `owner`, `escrow`, `batchNFT`, `userProfile`, `feeBps`.
    - `struct Listing { seller, price, active, tokenId, uri }`
    - `nextListingId`, `mapping(uint256 => Listing) _listings`.
  - Fungsi seller:
    - `createListing(price, tokenId, uri)` – hanya Farmer dan owner token; menyimpan listing baru.
    - `updateListing(listingId, newPrice, newUri)` – edit harga/deskripsi.
    - `cancelListing(listingId)` – nonaktifkan listing.
  - Fungsi buyer:
    - `purchase(listingId)` – hanya Buyer:
      - `msg.value` harus = `price`.
      - Panggil `escrow.createEscrow{value: msg.value}(seller, buyer, feeBps)`.
      - Panggil `batchNFT.safeTransferFrom(seller, buyer, tokenId)`.
      - Nonaktifkan listing + emit event `Purchased`.

---

## 4. Environment Variables

**Frontend (`.env.local`)**

Contoh untuk Ganache lokal:

```bash
PINATA_JWT=eyJ...
NEXT_PUBLIC_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:7545

NEXT_PUBLIC_BATCHNFT_ADDRESS=0x...   # dari build/contracts/BatchNFT.json networks["5777"].address
NEXT_PUBLIC_USERPROFILE_ADDRESS=0x...
NEXT_PUBLIC_ESCROW_ADDRESS=0x...     # (opsional: untuk util escrow)
NEXT_PUBLIC_MARKETPLACE_ADDRESS=0x...
```

**Backend / Truffle (`.env`)**

Jika ingin deploy ke Sepolia via Infura:

```bash
INFURA_SEPOLIA_URL=https://sepolia.infura.io/v3/<INFURA_API_KEY>
DEPLOYER_PRIVATE_KEY=0x...   # private key wallet deployer (jaga baik‑baik)
```

Script `scripts/deploy.ts` juga memakai:

```bash
NEXT_PUBLIC_RPC_URL=...  # sama seperti di .env.local
PRIVATE_KEY=0x...        # untuk deploy UserProfile via ethers.js (opsional)
```

Setelah mengubah `.env.local`, selalu restart `npm run dev`.

---

## 5. Menjalankan di Ganache (Local Dev)

1. **Start Ganache**
   - RPC: `http://127.0.0.1:7545`
   - Network ID biasanya `5777`, chain ID `1337`.

2. **Compile & migrate kontrak**

   ```bash
   npx truffle compile
   npx truffle migrate --reset --network development
   ```

   Migration akan deploy:
   - `BatchNFT`
   - `Escrow` (feeRecipient = `accounts[0]`, feeBps = 250 → 2.5%)
   - `UserProfile`
   - `Marketplace` (terhubung ke `BatchNFT`, `Escrow`, `UserProfile` dan otomatis di‑approve di `Escrow`).

3. **Isi `.env.local` dengan alamat kontrak**
   - Buka `build/contracts/*.json`, lihat `networks["5777"].address` untuk:
     - `BatchNFT.json`
     - `UserProfile.json`
     - `Escrow.json`
     - `Marketplace.json`
   - Masukkan ke `NEXT_PUBLIC_*_ADDRESS` seperti di atas.

4. **Set MetaMask ke Ganache**
   - Tambah network `Localhost 7545` (RPC `http://127.0.0.1:7545`, chain ID `1337`).
   - Pilih network tersebut di MetaMask.
   - (Opsional) import private key akun Ganache supaya punya saldo ETH lokal.

5. **Jalankan frontend**

   ```bash
   npm install
   npm run dev
   ```

   Aplikasi jalan di `http://localhost:3000`.

---

## 6. Alur Penggunaan

**1) Setup Profil & Role**

- User connect wallet (button di navbar) → `/roles`:
  - Pilih role: Buyer / Farmer / Logistics.
  - Isi username.
  - Simpan ke blockchain via `UserProfile.setUserProfile`.
- Di home (`/`), app membaca profil via `getUser(address)`:
  - Menampilkan `username` dan `Role` di menu user.
  - Nantinya bisa digunakan untuk guard akses halaman (mis. Farmer hanya bisa ke dashboard farmer, dll.).

**2) Farmer – Mint & Listing**

- Mint batch baru di `/farmer/minting`:
  - Upload gambar batch → IPFS (Pinata) via `/api/upload` → dapat `cid` + URL.
  - Form detail batch diisi.
  - Panggil `BatchNFT.mintBatch(to, "ipfs://cid")` dengan wallet farmer (role `Farmer`).
  - Setelah transaksi, baca `tokenURI` + `getStatus` untuk update UI & QR code.
- Setelah mint, workflow berikutnya (marketplace):
  - Pantau token ID hasil mint.
  - Panggil `Marketplace.createListing(priceWei, tokenId, uri)` dari halaman farmer/dashboard (belum di‑hook di UI, tapi kontrak siap).

**3) Buyer – Beli dan Konfirmasi Pembayaran**

- Buyer melihat daftar kopi di home (`/`):
  - Saat ini masih dummy, tetapi targetnya listing akan diambil dari `Marketplace`.
- Pada saat pembelian on‑chain penuh:
  - `ProductModal` akan memanggil `Marketplace.purchase(listingId, { value: price })`.
  - `Escrow` menyimpan dana, NFT berpindah ke buyer.
- Di `/buyer`:
  - Tabel order akan membaca:
    - Info NFT (BatchNFT / Marketplace).
    - Status escrow (Escrow) dan status pengiriman (BatchNFT.getStatus).
  - Tombol **Confirm Payment** memanggil `Escrow.confirmReceived(escrowId)` untuk me‑release dana ke farmer.

**4) Logistics – Update Status**

- User ber‑role Logistics akan menggunakan `/logistic`:
  - UI sudah siap untuk memilih order & mengubah status (dummy).
  - Integrasi target:
    - Panggil `BatchNFT.updateBatchStatus(tokenId, Status.Shipped/Delivered)` dengan wallet LOGISTICS_ROLE.
  - Buyer hanya bisa confirm escrow kalau status sudah `Delivered`.

---

## 7. API & Utils Detail

**Upload IPFS (`/api/upload`)**

- Method: `POST`
- Body: `form-data` dengan field `file`.
- Respons sukses:
  ```json
  { "cid": "<CID>", "url": "https://gateway.pinata.cloud/ipfs/<CID>" }
  ```

**Signed URL (`/api/url`)**

- Method: `GET`
- Respons sukses:
  ```json
  { "url": "https://..." }
  ```
  URL ini valid sebentar untuk upload langsung ke Pinata (tidak wajib dipakai di versi sekarang).

**`utils/BatchNFT.ts`**

- `mintBatch(to, ipfsHash)` – mint batch baru.
- `updateBatchStatus(tokenId, status)` – update status on‑chain.
- `getBatchMetadata(tokenId)` – baca `tokenURI` (biasanya `ipfs://CID`).
- `getBatchStatus(tokenId)` – baca enum status melalui `getStatus`.

**`utils/getUserProfile.ts`**

- `getUserProfileContract(providerOrSigner)` – helper untuk instansiasi kontrak `UserProfile` dari artefak + provider/signer.

**`hooks/useWallet.ts`**

- `connect`, `disconnect`.
- `address`, `signer`, `isConnecting`, `hasLoggedOut`.

---

## 8. Testing & Pengembangan Lanjut

- **Kontrak**
  - Tambah test di folder `test/` untuk:
    - `BatchNFT` – mint, update status, role check, tokenURI.
    - `UserProfile` – set/get user, role valid.
    - `Escrow` – createEscrow, confirmReceived, approveCancel, raiseDispute, resolveDispute.
    - `Marketplace` – createListing, cancel, purchase (integrasi dengan Escrow + BatchNFT).

- **Frontend**
  - Ganti alur “Buy Now” di `ProductModal` untuk memanggil `Marketplace.purchase` (bukan `sendTransaction` langsung).
  - Sambungkan dashboard buyer/logistics ke data on‑chain (Escrow + BatchNFT).
  - Tambah halaman detail token (QR target) yang membaca metadata IPFS + status + riwayat (kalau ditambahkan).

Brewify sudah memiliki fondasi lengkap: profile on‑chain, NFT batch, marketplace, dan escrow. Sisanya adalah menyambungkan semua potongan ini di UI dan menambah test agar sistem stabil di production.*** End Patch
