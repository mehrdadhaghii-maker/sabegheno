import React, { useState } from "react";
import { Landmark, ClipboardList } from "lucide-react";
import Facilities from "./Facilities.jsx";
import Commitments from "./Commitments.jsx";

// ONE menu for everything about credits: the installment ledger and the report of delays / bounced cheques / bad debts.
const TABS = [
  { key: "ledger", label: "اعتبارها و اقساط", icon: Landmark, View: Facilities },
  { key: "report", label: "گزارش تعهد و بدحسابی", icon: ClipboardList, View: Commitments },
];

export default function CreditsHub() {
  const [tab, setTab] = useState("ledger");
  const Current = TABS.find((t) => t.key === tab).View;
  return (
    <div className="bx-stack">
      <div className="fc-mode" role="tablist" aria-label="اعتبارها و تعهدات">
        {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}><t.icon size={16} /> {t.label}</button>)}
      </div>
      <Current />
    </div>
  );
}
