import React, { useEffect, useMemo, useState } from "react";
import { JALALI_MONTHS, daysInJalaliMonth, parseJalali, todayJalali, formatJalali } from "./jalali.js";
import { faDigits } from "./kit.jsx";

// Day / month / year pickers for Jalali dates. value = "1371/5/12" ("" until all three are chosen).
export default function JalaliInput({ value, onChange, yearsBack = 100, yearsAhead = 0, yearsFromEnd, id }) {
  const today = useMemo(() => todayJalali(), []);
  const init = parseJalali(value) || { y: "", m: "", d: "" };
  const [p, setP] = useState(init);
  useEffect(() => { const q = parseJalali(value); if (q) setP(q); else if (!value) setP({ y: "", m: "", d: "" }); }, [value]);

  const maxY = today.y + yearsAhead - (yearsFromEnd || 0);
  const years = useMemo(() => Array.from({ length: yearsBack + yearsAhead + 1 - (yearsFromEnd || 0) }, (_, i) => maxY - i), [maxY, yearsBack, yearsAhead, yearsFromEnd]);
  const dim = p.y && p.m ? daysInJalaliMonth(+p.y, +p.m) : 31;

  const set = (patch) => {
    const n = { ...p, ...patch };
    if (n.y && n.m && n.d && +n.d > daysInJalaliMonth(+n.y, +n.m)) n.d = daysInJalaliMonth(+n.y, +n.m); // Esfand 30 → 29 in a non-leap year
    setP(n);
    onChange(n.y && n.m && n.d ? formatJalali({ y: +n.y, m: +n.m, d: +n.d }) : "");
  };
  return (
    <div className="bx-jalali" id={id}>
      <select aria-label="روز" value={p.d} onChange={(e) => set({ d: e.target.value })}><option value="">روز</option>{Array.from({ length: dim }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{faDigits(d)}</option>)}</select>
      <select aria-label="ماه" value={p.m} onChange={(e) => set({ m: e.target.value })}><option value="">ماه</option>{JALALI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
      <select aria-label="سال" value={p.y} onChange={(e) => set({ y: e.target.value })}><option value="">سال</option>{years.map((y) => <option key={y} value={y}>{faDigits(y)}</option>)}</select>
    </div>
  );
}
