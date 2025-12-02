# Brewify – Coffee Supply Chain dApp

Brewify adalah dApp rantai pasok kopi. Petani (Farmer) melakukan minting **Batch NFT** sebagai label brand/batch kopi, membuat listing di **Marketplace**, pembeli (Buyer) membeli kopi lewat Marketplace, dan pihak **Logistics** meng‑update status pengiriman. Semua profil user, metadata batch, dan pembayaran (termasuk fee platform & logistics) terekam di blockchain dan IPFS.

---

## Anggota Kelompok
| Nama | NIM |
|------|-----|
| Muhamad Raechan Ulwan Zacky | F1D02310015 |
| Ida Bagus Amanta Pradipa Krishna | F1D02310059 |
| Muhammad Alfath Mavianza | F1D02310077 |

---

## 1. Arsitektur & Fitur Utama

- **Batch NFT (ERC721) – `BatchNFT.sol`**
  - Satu NFT mewakili *brand/batch* kopi, bukan 1 kantong kopi.
  - Metadata disimpan di IPFS (`ipfs://<CID_METADATA>`), berisi:
    - `name`, `description`
    - `image` (IPFS CID gambar)
    - atribut: Origin, Process, Harvested, Roasted, Packed, Price (ETH), Quantity.
  - Status produksi global per token:
    - `Unknown → Harvested → Processed (Roasted) → Packed → Shipped → Delivered`.
    - Di UI dipakai khusus `Harvested / Roasted / Packed`.
  - Hanya wallet yang ber‑role **Farmer** di `UserProfile` yang boleh mint & update status produksi.

- **On‑chain Profile & Role – `UserProfile.sol`**
  - 1 wallet hanya boleh punya **1 role**:
    - `Buyer`, `Farmer`, atau `Logistics`.
  - Disimpan sebagai:
    - `struct Profile { Role role; string username; bool isRegistered; }`.
  - Fungsi penting:
    - `setUserProfile(Role _role, string _username)` – set role+username untuk `msg.sender`.
    - `getUser(address)` – dipakai seluruh frontend untuk cek role & username.

- **Marketplace – `Marketplace.sol`**
  - Farmer membuat listing kopi yang mereferensi satu `tokenId` (BatchNFT):
    - `price` = harga per unit (wei).
    - `stock` = jumlah unit/qty kopi yang tersedia.
    - `uri` = optional metadata; kalau kosong, frontend fallback ke `BatchNFT.tokenURI`.
  - Buyer membeli lewat:
    - `purchase(listingId, quantity)` → memanggil `Escrow.createEscrow` dan mengurangi stok.
    - NFT **tidak dipindahkan**; NFT tetap di petani sebagai label brand, sedangkan order mewakili kopi fisik yang dikirim.
  - `Purchased` event menyimpan: `listingId`, `escrowId`, `buyer`, `amount`, `tokenId`, `quantity`.

- **Escrow + Logistics – `Escrow.sol`**
  - Setiap `purchase` menciptakan satu `EscrowOrder`:

    ```solidity
    struct EscrowOrder {
      address buyer;
      address payable seller;
      uint256 amount;
      uint16 feeBpsSnapshot;
      bool   shipped;          // informasi dari seller (optional)
      address logistics;       // alamat logistics untuk order ini
      uint16 shippingFeeBps;   // fee logistics (bps, mis. 500 = 5%)
      ShippingStatus shippingStatus; // AwaitingShipment / OnTheWay / Arrived
      bool buyerCancelApproved;
      bool sellerCancelApproved;
      bool disputed;
      bool released;
    }
    ```

  - Owner bisa set:
    - `feeBps` – fee platform (bps) yang diambil dari setiap order.
    - `defaultShippingFeeBps` – default fee logistics (bps) untuk order baru.
  - Shipping status per‑order:
    - `createEscrow` → `shippingStatus = AwaitingShipment`.
    - Logistics pertama kali memanggil `logisticsMarkOnTheWay(escrowId)`:
      - Jika `logistics` masih `address(0)` → diset ke `msg.sender`.
      - Jika `shippingFeeBps == 0` → diisi `defaultShippingFeeBps`.
      - `shippingStatus` berubah ke `OnTheWay`.
    - `logisticsMarkArrived(escrowId)`:
      - Hanya boleh dari `OnTheWay`, dan oleh `logistics` yang sama.
      - `shippingStatus` → `Arrived`.
  - Buyer konfirmasi penerimaan:
    - `confirmReceived(escrowId)` hanya boleh dipanggil `buyer` dan, jika logistics terpasang, hanya saat `shippingStatus == Arrived`.
    - Pembagian dana:

      ```solidity
      platformFee = amount * feeBpsSnapshot / MAX_BPS;
      shippingFee = amount * shippingFeeBps / MAX_BPS;
      sellerPayout = amount - platformFee - shippingFee;

      → sellerPayout ke seller
      → platformFee ke feeRecipient
      → shippingFee ke logistics
      ```

- **IPFS & Upload**
  - `/api/upload` → upload gambar ke Pinata (IPFS) dan mengembalikan `{ cid, url }`.
  - `/api/metadata` → menyimpan JSON metadata ke IPFS.
  - `BatchNFT.mintBatch` dipanggil dengan `tokenURI` dari metadata IPFS.

---

## 2. Tech Stack

- **Frontend**
  - Next.js 16 (App Router) + React 19 + TypeScript.
  - Tailwind CSS v4 untuk styling.
  - `framer-motion` untuk animasi layout & modal.
  - `lucide-react` untuk ikon.
  - `qrcode.react` untuk QR code.

- **Web3 & Storage**
  - `ethers@6` untuk koneksi ke wallet & kontrak.
  - `@openzeppelin/contracts@4.9` untuk ERC721 & AccessControl.
  - Pinata SDK untuk upload file & metadata ke IPFS.

- **Smart Contract Tooling**
  - Solidity 0.8.19.
  - Truffle (compile & migrate).
  - Ganache (local dev) / Infura (opsional testnet).

---

## 3. Struktur Direktori Penting

### Frontend (`app/`)

- `app/page.tsx` – **Marketplace publik**
  - Membaca semua `ListingCreated` di kontrak `Marketplace` dan memuat listing aktif (`active && stock > 0`).
  - Ambil metadata dari `uri` listing (atau fallback `BatchNFT.tokenURI`) via Pinata gateway → menampilkan:
    - gambar, nama brand, origin, process, timeline, harga, dan stok.
  - Mengambil username farmer dari `UserProfile.getUser(seller)` untuk label “by Farmer X”.
  - Klik card produk → `ProductModal`:
    - Mengecek network vs `NEXT_PUBLIC_EXPECTED_CHAIN_ID`.
    - Memanggil `Marketplace.purchase(listingId, quantity=1, { value })` menggunakan MetaMask.

- `app/components/ProductModal.tsx`
  - Modal detail produk + tombol **Buy Now**.
  - Menggunakan `BrowserProvider` (ethers v6) untuk:
    - cek chainId vs `EXPECTED_CHAIN_ID`,
    - memanggil `purchase` dengan nilai `priceEth` di listing.
  - Menampilkan toast success/error.

- `app/roles/page.tsx` – **Setup Role & Username**
  - Step‑per‑step pilih role (Buyer/Farmer/Logistics) lalu isi username.
  - Memanggil `UserProfile.setUserProfile(role, username)`.
  - Hook `useWallet` memastikan wallet connect dan menolak network yang salah.

- `app/farmer/minting/page.tsx` – **Mint Batch NFT + Listing**
  - Form lengkap untuk batch: name, origin, process, description, price, quantity, harvested/roasted/packed, dan upload gambar.
  - Alur:
    1. Upload gambar → `/api/upload` → `imageIpfs = ipfs://<CID_IMAGE>`.
    2. Bentuk metadata JSON → `/api/metadata` → `tokenUri = ipfs://<CID_METADATA>`.
    3. Cek network vs `EXPECTED_CHAIN_ID` dan mint:
       - `BatchNFT.mintBatch(to, tokenUri)`.
    4. Ambil `tokenId` dari event `BatchMinted` dan langsung membuat listing:
       - `Marketplace.createListing(priceWei, tokenId, stock, tokenUri)`.
  - Menampilkan QR code dan informasi dasar token yang baru di‑mint.

- `app/farmer/page.tsx` – **Farmer Product Dashboard**
  - Memastikan wallet ber‑role Farmer (via `UserProfile.getUser`).
  - Membaca event `BatchMinted(to == farmer)` dari `BatchNFT` dan metadata IPFS untuk menampilkan daftar batch milik farmer (image, name, origin, process, timeline).
  - Menggabungkan info listing dari `Marketplace` (ListingCreated + `getListing`) untuk setiap `tokenId` → menampilkan harga & stok saat ini.
  - Menu `...` di card produk:
    - **Edit** → memanggil `Marketplace.updateListing(listingId, newPriceWei, newStock, uri)`.
    - **Delete** → memanggil `Marketplace.cancelListing(listingId)`.
  - Tombol:
    - “Mint New Coffee” → ke `/farmer/minting`.
    - “Shipment Dashboard” → ke `/farmer/dashboard`.

- `app/farmer/dashboard/page.tsx` – **Farmer Shipment Dashboard**
  - Membaca event `Purchased` dari Marketplace dan memfilter yang seller‑nya = farmer.
  - Untuk setiap order:
    - mengambil `getListing(listingId)` untuk harga + tokenId,
    - membaca status produksi batch dari `BatchNFT.getStatus(tokenId)`,
    - membaca `Escrow.getEscrow(escrowId)` untuk menentukan apakah sudah `shipped / released`.
  - Menampilkan status produksi per order:
    - `Harvested`, `Roasted`, atau `Packed`.
  - Tombol aksi:
    - Jika `Harvested` → tombol **Roasting** memanggil `BatchNFT.updateBatchStatus(tokenId, Processed)` satu kali untuk seluruh batch.
    - Jika `Roasted` → tombol **Packing** memanggil `Escrow.markShipped(escrowId)` untuk order tersebut dan menandai status menjadi `Packed`.
    - Jika `Packed` → tidak ada aksi (menunggu proses logistics & buyer).

- `app/buyer/page.tsx` – **Buyer Orders**
  - Memfilter event `Purchased` berdasarkan `buyer` (alamat wallet).
  - Untuk tiap order:
    - membaca listing & metadata batch (name, origin, process),
    - membaca `Escrow.getEscrow(escrowId)` untuk field `released`,
    - membaca `Escrow.getShipping(escrowId)` untuk `shippingStatus`.
  - Status di UI:
    - `shippingStatus == AwaitingShipment` → “Awaiting Shipment”,
    - `shippingStatus == OnTheWay` → “On The Way”,
    - `shippingStatus == Arrived` atau `released == true` → “Arrived”.
  - Tombol **Confirm**:
    - hanya aktif ketika status `Arrived` dan `released == false`,
    - memanggil `Escrow.confirmReceived(escrowId)` → dana dibagi ke farmer, platform, dan logistics.

- `app/logistic/page.tsx` – **Logistics Dashboard**
  - Memuat semua event `Purchased` dan menggabungkan dengan metadata batch & harga.
  - Untuk setiap order:
    - membaca `Escrow.getShipping(escrowId)` → `logistics`, `shippingFeeBps`, `shippingStatus`,
    - jika `logistics` kosong (`0x0`) atau sama dengan alamat wallet logistics yang login → `canUpdate = true`.
  - Dropdown status di kolom Action:
    - Jika `Awaiting Shipment` → opsi `["On The Way", "Arrived"]`,
    - Jika `On The Way` → opsi `["Arrived"]`,
    - Jika `Arrived` → tidak ada opsi.
  - Konfirmasi perubahan status:
    - Memanggil `Escrow.logisticsMarkOnTheWay` / `Escrow.logisticsMarkArrived` (dengan `signer` logistics).
  - Buyer dashboard membaca status yang sama sehingga tracking sinkron.

- `app/api/upload/route.ts` – upload file ke IPFS (Pinata).
- `app/api/metadata/route.ts` – upload JSON metadata batch ke IPFS.
- `app/components/Toast.tsx` – komponen notifikasi success/error.
- `hooks/useWallet.ts` – abstraksi MetaMask + pengecekan chain ID + flag `wrongNetwork` yang dipakai di semua halaman.

---

## 4. Kontrak & Alamat

Kontrak utama (lihat folder `contracts/`):

- `BatchNFT.sol` – ERC721 + status produksi.
- `UserProfile.sol` – single role + username per wallet.
- `Escrow.sol` – escrow pembayaran + fee platform + fee logistics + tracking shipping per order.
- `Marketplace.sol` – listing & purchase kopi menggunakan BatchNFT sebagai referensi brand.
- `LogisticsPayment.sol` – **legacy**; tidak lagi dipakai di frontend sejak shipping dipindah ke `Escrow`.

Deployment lokal (Ganache) menggunakan Truffle:

```bash
npx truffle compile
npx truffle migrate --reset --network development
```

Migration akan melakukan:

1. Deploy `BatchNFT` dan `Escrow` (`2_deploy_contracts.js`).
2. Deploy `UserProfile` dan `Marketplace`, lalu:
   - menghubungkan `BatchNFT` ke `UserProfile` (set role registry),
   - menghubungkan `Marketplace` ke `Escrow` + `BatchNFT` + `UserProfile`,
   - memanggil `escrow.setApprovedMarketplace(marketplace.address, true)`.

Setelah deploy, gunakan `build/contracts/*.json` untuk mengambil alamat kontrak (lihat `networks["5777"].address`) dan isi ke `.env`/`.env.local`.

---

## 5. Environment Variables

Contoh `.env` untuk lokal (Ganache):

```bash
PINATA_JWT=<JWT dari Pinata>
NEXT_PUBLIC_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:7545
NEXT_PUBLIC_EXPECTED_CHAIN_ID=1337

NEXT_PUBLIC_BATCHNFT_ADDRESS=0x...
NEXT_PUBLIC_USERPROFILE_ADDRESS=0x...
NEXT_PUBLIC_ESCROW_ADDRESS=0x...
NEXT_PUBLIC_MARKETPLACE_ADDRESS=0x...
```

Jika ingin deploy ke testnet (mis. Sepolia) dengan Truffle, tambahkan:

```bash
INFURA_SEPOLIA_URL=https://sepolia.infura.io/v3/<INFURA_API_KEY>
DEPLOYER_PRIVATE_KEY=0x... # Jaga baik-baik
```

Setelah mengubah `.env`, restart `npm run dev` agar Next.js membaca ulang environment.

---

## 6. Alur Penggunaan dApp

1. **Setup Profil**
   - Buka `http://localhost:3000`, connect wallet, lalu klik **Register** → diarahkan ke `/roles`.
   - Pilih role: Buyer / Farmer / Logistics dan isi username → transaksi `setUserProfile`.
   - Setelah sukses, di navbar akan terlihat username + role, dan tombol **Dashboard {role}** untuk masuk ke dashboard masing‑masing.

2. **Farmer – Mint & Listing Brand Kopi**
   - Masuk ke `/farmer/minting`:
     - Lengkapi form + upload gambar.
     - Mint Batch NFT + buat listing di Marketplace dalam sekali alur.
   - Di `/farmer`:
     - Lihat semua batch milik farmer (image, brand, origin, process, timeline, harga, stok).
     - Edit / hapus listing lewat menu `...`.
   - Di `/farmer/dashboard`:
     - Lihat semua pesanan yang masuk (per buyer).
     - Jalankan proses produksi:
       - `Harvested → Roasting → Roasted`,
       - `Roasted → Packing` (menandai order sebagai siap dikirim).

3. **Buyer – Beli & Konfirmasi Pembayaran**
   - Di halaman utama `/`, pilih brand kopi → klik card → **Buy Now**.
   - MetaMask akan meminta konfirmasi transaksi `Marketplace.purchase`:
     - role harus `Buyer`,
     - nilai ETH harus sama dengan harga per unit.
   - Setelah transaksi, di `/buyer`:
     - order muncul di tabel dengan status `Awaiting Shipment`,
     - setelah logistics meng‑update status → status berubah menjadi `On The Way` / `Arrived`.
   - Saat status `Arrived`, tombol **Confirm** aktif → memanggil `Escrow.confirmReceived` dan me‑release dana ke farmer + fee ke logistics & platform.

4. **Logistics – Tracking Pengiriman**
   - Login sebagai role `Logistics` lalu buka `/logistic`.
   - Lihat daftar pesanan yang punya `logistics` kosong atau sama dengan wallet yang sedang login.
   - Gunakan dropdown di kolom Action untuk meng‑update:
     - `Awaiting Shipment → On The Way`,
     - `On The Way → Arrived` (atau langsung `Awaiting Shipment → Arrived` jika perlu; kontrak akan memaksa urutannya).
   - Perubahan status langsung ter‑refleksi di dashboard Buyer dan Farmer (via `Escrow.getShipping`).

---

## 7. Pengembangan Lanjut

Beberapa ide lanjutan yang sesuai dengan struktur kode saat ini:

- Tambah histori status per order (event/logs) dan tampilkan timeline pengiriman di UI Buyer/Logistics.
- Tambah filter & sorting di marketplace (berdasarkan origin, process, rentang harga).
- Tambah halaman detail brand (per `tokenId`) yang dapat diakses via QR code.
- Tambah test Truffle untuk skenario end‑to‑end:
  - Mint batch → createListing → purchase → logistics update → confirmReceived.

dApp ini sudah memiliki alur end‑to‑end: profile on‑chain, branding batch dengan NFT, marketplace dengan stok, escrow terintegrasi dengan fee & logistics, dan tiga dashboard terpisah untuk Buyer, Farmer, dan Logistics. README ini mengikuti kode terbaru yang ada di repository saat ini. 
