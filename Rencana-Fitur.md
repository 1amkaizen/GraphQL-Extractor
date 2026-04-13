Saya ingin menambahkan fitur Payload Engine ke dalam tools GraphQL saya.

Fitur ini harus mencakup beberapa bagian berikut:

### 1. Payload Library (Static Payloads)

Tambahkan sistem payload yang berisi kumpulan payload siap pakai, seperti:

* Introspection payload
* Payload untuk melihat struktur schema GraphQL
* Payload untuk extract semua field
* Payload tambahan lain yang umum digunakan dalam bug bounty GraphQL recon

Payload ini harus bisa langsung di-copy oleh user tanpa perlu modifikasi, sehingga mempermudah proses testing manual.

---

### 2. Smart Payload Generator

Buat fitur generator payload yang bersifat dinamis, tidak hanya static copy-paste.

Payload harus otomatis menyesuaikan berdasarkan operation yang dipilih user.

Contoh:
Jika user memilih operation `CmsCommitLogs`, maka tools secara otomatis menghasilkan beberapa mode payload:

* Single request version
* Aliasing version (multi-query dalam satu request)
* Variable fuzzing version
* Batch request version (opsional)

Tujuan utama adalah membantu bug hunter melakukan testing lebih cepat dan fleksibel tanpa menulis payload manual.

---

### 3. Error-Based Payload Engine

Tambahkan fitur untuk menghasilkan payload yang sengaja dibuat invalid atau salah, dengan tujuan reconnaissance.

Jenis payload:

* Field tidak valid
* Type mismatch
* Null injection
* Query yang tidak sesuai schema

Tujuan fitur ini:

* Mengungkap struktur schema tersembunyi
* Menemukan field valid melalui error response
* Mengambil informasi resolver atau struktur internal dari pesan error GraphQL

---

Fokus utama dari semua fitur ini adalah:

* Mempercepat GraphQL recon
* Membantu bug hunter dalam eksplorasi schema
* Mempermudah testing IDOR dan access control issue

