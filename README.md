# BS-SAMS

ระบบข้อมูลผู้ประสบปัญหาทางสังคม กองสวัสดิการสังคม องค์การบริหารส่วนตำบลบ้านเสด็จ

React + Vite, Cloudflare Workers, D1. ไม่มีการ deploy อัตโนมัติ ไม่มีข้อมูลบุคคลจริงหรือรหัสผ่านเริ่มต้นใน source code

## เริ่มพัฒนาในเครื่อง

ต้องใช้ Node.js 22 หรือใหม่กว่า ใช้ checkout เดิม ไม่ต้องสร้าง worktree

```sh
cd /workspace/BS-SAMS
export npm_config_cache=/tmp/bs-sams-npm
export XDG_CONFIG_HOME=/workspace/BS-SAMS/.wrangler/config
export WRANGLER_LOG_PATH=/tmp/bs-sams-wrangler.log
npm ci
npm run db:migrate
npm run build
```

สร้างผู้ดูแลระบบในฐานข้อมูล **local** ครั้งแรก โดยตั้ง `ADMIN_PASSWORD` อย่างปลอดภัยใน terminal ไม่บันทึกลงไฟล์หรือ Git:

```sh
read -rs -p 'Initial admin password (12+ characters): ' ADMIN_PASSWORD
export ADMIN_PASSWORD
npm run bootstrap
unset ADMIN_PASSWORD
npm start
```

ชื่อผู้ใช้คือ `admin` เมื่อเข้าสู่ระบบครั้งแรกต้องเปลี่ยนรหัสผ่าน ไม่มีบัญชีสมัครเอง หากมีบัญชี admin อยู่แล้ว bootstrap จะไม่เปลี่ยนรหัสผ่านเดิม

`npm start` รัน Worker พร้อมหน้าเว็บที่ build ไว้บนพอร์ต 8787 ต้อง build ใหม่หลังแก้ frontend หรือใช้ `npm run dev` อีก terminal เพื่อเปิด Vite บนพอร์ต 5173 ซึ่ง proxy API ไปยัง Worker พอร์ต 8787

D1 local อยู่ใน `.wrangler/state` และไม่ถูก commit ห้ามใช้ข้อมูลส่วนบุคคลจริงในการทดสอบ

## ตรวจสอบ

```sh
npm test
npm run build
# ขณะ npm start ทำงานอยู่ ต้องมี Chromium ที่ /usr/bin/chromium
npm run test:integration
```

Integration test ใช้เฉพาะ local D1 สร้างบัญชีและข้อมูลจำลองชั่วคราวแล้วลบทิ้ง ทดสอบ login, forced password change, แบบฟอร์มบุคคล/คำขอ/การช่วยเหลือ, Excel, ถังขยะ, optimistic concurrency, สิทธิ์เจ้าหน้าที่ และหน้าจอ 1536×1024 / 390×844 ภาพ QA ถูกเขียนใต้ /tmp ไม่อยู่ใน repository

## ขอบเขต

- ทะเบียนบุคคลเดียวมีหลายคำขอ แต่ละคำขอมีประวัติการช่วยเหลือหลายครั้ง
- เลขบัตรไม่บังคับ หากระบุตรวจ checksum และห้ามซ้ำ รวมข้อมูลในถังขยะ
- ความพิการเลือกหลายประเภทได้ หรือไม่มีความพิการ
- สถานะคำขอและเหตุผลยุติแยกจากการช่วยเหลือสำเร็จ
- ผู้ดูแลกำหนดสิทธิ์ 5 แบบและหมู่บ้านแก่เจ้าหน้าที่ ข้อมูลสรุปเห็นทั้งตำบล ส่วนข้อมูลบุคคล/ส่งออกจำกัดสิทธิ์จาก API
- CSV และ Excel เป็นไฟล์จริง ป้องกันข้อความเริ่มด้วยสูตรใน CSV
- ปีงบประมาณไทยเริ่ม 1 ตุลาคม อายุรายงานคำนวณ ณ วันสิ้นสุดช่วงรายงาน
- ลบแบบกู้คืนได้ บัญชีผู้ใช้และหมู่บ้านใช้การปิดใช้งานแทนลบประวัติ
- ไม่มีนำเข้าเอกสาร แนบภาพประกอบ หรือนัดติดตาม โลโก้ระบบรองรับไฟล์ raster ไม่เกิน 200 KB

## ก่อนนำขึ้น Cloudflare

ยังไม่ได้สร้าง remote D1 หรือเผยแพร่ Worker ต้องสร้าง D1 ในบัญชีที่ได้รับอนุญาต แทน `database_id` local placeholder ใน `wrangler.jsonc` แล้วใช้ migration แบบ remote และจัดเตรียมผู้ดูแลคนแรกผ่านช่องทางที่ปลอดภัย Bootstrap script ใน repository นี้รองรับเฉพาะ local เท่านั้น

ต้องตรวจสอบข้อกำหนดการจัดเก็บข้อมูลอ่อนไหวของหน่วยงานและนโยบายตำแหน่งจัดเก็บข้อมูลก่อนใช้ข้อมูลจริง รวมถึงสำรอง/กู้คืนและกำหนดอายุเก็บข้อมูล ระบบปัจจุบันยังอ่านรายการทั้งชุดเพื่อคำนวณรายงาน เหมาะสำหรับเริ่มพัฒนาและตรวจรับงาน ต้องประเมินขนาดข้อมูลและแยก aggregation ใน SQL ก่อนใช้งานปริมาณมาก

ดู [โครงสร้างและข้อจำกัด](docs/architecture.md)
