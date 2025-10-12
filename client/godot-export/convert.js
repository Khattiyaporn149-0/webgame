import fs from "fs";

const inputFile = "collision.json";
const outputFile = "collision_rects.json";

// อ่านข้อมูล polygon ที่ export จาก Godot
const data = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const rects = [];

// กำหนดค่าการแปลงพิกัด (Godot → เว็บเกม)
const SHIFT_X = 4096;   // ครึ่งของขนาด world 8192
const SHIFT_Y = 4096;   // ครึ่งของขนาด world 8192
const SCALE = 1;        // ถ้าแมพเล็ก/ใหญ่กว่า ปรับได้ เช่น 0.5

for (const poly of data) {
  if (poly.type === "polygon" && Array.isArray(poly.points) && poly.points.length > 0) {
    const xs = poly.points.map(p => p.x);
    const ys = poly.points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // ✅ แปลงพิกัดจาก Godot (ศูนย์กลาง) → เว็บเกม (ซ้ายบน)
    rects.push({
      x: (minX + SHIFT_X) * SCALE,
      y: (minY + SHIFT_Y) * SCALE,
      w: (maxX - minX) * SCALE,
      h: (maxY - minY) * SCALE
    });
  }
}

// บันทึกผลลัพธ์
fs.writeFileSync(outputFile, JSON.stringify(rects, null, 2));
console.log(`✅ Converted ${rects.length} polygons into rectangles → ${outputFile}`);
console.log(`📦 Coordinates shifted by (${SHIFT_X}, ${SHIFT_Y}), scale ×${SCALE}`);
