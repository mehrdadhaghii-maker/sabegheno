import React, { useState } from "react";
import { ChevronDown, FileDown, HelpCircle, Search } from "lucide-react";
import { Card, CardHead } from "./kit.jsx";

const FAQS = [
  ["چطور قرارداد را امضا و ارسال کنم؟", "ابتدا قرارداد نمونه را دانلود کنید. پس از امضا، فایل PDF یا تصویر امضاشده را در بخش «پشتیبانی» داخل یک تیکت جدید بارگذاری و ارسال کنید."],
  ["ثبت گزارش کسب‌وکار چه زمانی اثر می‌گذارد؟", "پس از ثبت موفق، گزارش بلافاصله وارد چرخهٔ اعتبارسنجی می‌شود و در تصمیم‌های بعدیِ همهٔ کسب‌وکارها طبق سیاست سامانه لحاظ می‌شود."],
  ["اگر مشتری بدحساب ثبت شود چه اتفاقی می‌افتد؟", "تا زمانی که کسب‌وکار ثبت‌کننده تسویه را ثبت نکند، آن مشتری در تمام کسب‌وکارهای سامانه امکان دریافت اعتبار ندارد و نتیجهٔ استعلام او «ردشده» نمایش داده می‌شود."],
  ["هشدار هم‌پوشانی یعنی چه؟", "یعنی همان کد ملی در بازهٔ اخیر توسط کسب‌وکار دیگری هم استعلام یا تعهد گرفته است. در این حالت تصمیم برای احتیاط به «نیازمند بررسی» تغییر می‌کند و سقف پیشنهادی کاهش می‌یابد."],
  ["چگونه گزارش یک استعلام را به‌صورت PDF بگیرم؟", "از بخش «تاریخچه استعلام‌ها» روی دکمهٔ PDF کنار هر استعلام بزنید و در پنجرهٔ چاپ، «ذخیره به‌صورت PDF» را انتخاب کنید."],
  ["اگر استعلام با خطا مواجه شد چه کنم؟", "شناسهٔ استعلام و متن خطا را در یک تیکت پشتیبانی بنویسید تا تیم فنی بررسی کند."],
  ["آیا کد ملی مشتریان ذخیره می‌شود؟", "خیر. کد ملی فقط به‌صورت هش یک‌طرفه نگهداری می‌شود و در هیچ‌جا به‌صورت متن قابل مشاهده نیست."],
];

export default function Faq() {
  const [open, setOpen] = useState(0);
  const [q, setQ] = useState("");
  const list = FAQS.filter(([a, b]) => !q || a.includes(q) || b.includes(q));
  const download = () => Object.assign(document.createElement("a"), { href: "/sabegheno-contract-sample.pdf", download: "قرارداد-همکاری-سابقه-نو.pdf" }).click();
  return (
    <div className="bx-grid-2 wide-left">
      <Card><CardHead eyebrow="FAQ" title="پرسش‌های متداول" />
        <label className="bx-search wide"><Search size={17} /><input placeholder="جستجو در پرسش‌ها…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="bx-faq">{list.map(([a, b], i) => (
          <div key={a} className={`item ${open === i ? "open" : ""}`}><button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}><span>{a}</span><ChevronDown size={19} /></button>{open === i && <p>{b}</p>}</div>))}
          {list.length === 0 && <p className="bx-empty-text">موردی پیدا نشد.</p>}</div>
      </Card>
      <Card accent="navy"><CardHead eyebrow="DOCUMENTS" title="فرم‌ها و مستندات" />
        <button className="bx-doc" onClick={download}><FileDown size={22} /><div><b>قرارداد نمونهٔ همکاری</b><small>PDF — برای امضا و ارسال از طریق پشتیبانی</small></div></button>
        <div className="bx-note"><HelpCircle size={18} /><p>پاسخ سؤال‌تان را پیدا نکردید؟ از منوی «پشتیبانی» یک تیکت ثبت کنید.</p></div>
      </Card>
    </div>
  );
}
